import { normalizeGroundReflection } from "../modules/interaction3d/reflection-settings.js?v=20260918-reflection-user-settings-v1-20260918-review-1234-v2";
import { createReflectionCulling } from "./studio-reflection-culling.js?v=20260929-fade-culling-v1";
export function createGroundReflections({
  THREE: three,
  renderer: renderer,
  scene: scene,
  getRoot: getRoot,
  syncLighting: syncLighting,
  getFloorCamera: getFloorCamera = (fallbackCamera) => fallbackCamera,
  getStateKey: getStateKey = () => "",
  getSceneRevision: getSceneRevision = null,
  floorLighting: floorLighting = false,
  detail: detail = null,
  passes: passes = null,
  cull: cull = true,
  blur: blur = true,
  fadeHeight: fadeHeight = 0,
  maxResumeCapturesPerFrame: maxResumeCapturesPerFrame = Infinity,
  requestFrame: requestFrame = () => {},
}) {
  const settings = {
      ...normalizeGroundReflection(),
      fps: 30,
    },
    culling = createReflectionCulling(three, fadeHeight),
    stats = {
      captures: 0,
      renders: 0,
      lastMs: 0,
      totalMs: 0,
      allocations: 0,
      reuses: 0,
      cachedRecords: 0,
      cachedBytes: 0,
      inCapture: false,
    },
    cloneByMaterial = new WeakMap(),
    disposeByClone = new Map(),
    fadeRecordByMaterial = new Map(),
    reflectionUniforms = {
      groundReflectionPlane: {
        value: new three.Vector4(0, 1, 0, 0),
      },
      groundReflectionViewToWorld: {
        value: new three.Matrix4(),
      },
      groundReflectionFadeHeight: {
        value: fadeHeight,
      },
    },
    fadeArrayByInput = new WeakMap(),
    reflectionCameraBySource = new WeakMap(),
    scratchWorldPosition = new three.Vector3(),
    scratchWorldNormal = new three.Vector3(),
    scratchLookTarget = new three.Vector3(),
    scratchPlane = new three.Plane(),
    scratchPlaneVector = new three.Vector4(),
    scratchSignVector = new three.Vector4(),
    scratchProjectionMatrix = new three.Matrix4();
  function getRefractionFreeMaterial(sourceMaterialNode) {
    if (
      !sourceMaterialNode ||
      (!(sourceMaterialNode.transmission > 0) && !sourceMaterialNode.userData.alphaWallBand)
    )
      return passes?.material(sourceMaterialNode) || sourceMaterialNode;
    if (!cloneByMaterial.has(sourceMaterialNode)) {
      const refractionFreeClone = sourceMaterialNode.clone();
      ((refractionFreeClone.transmission = 0),
        (refractionFreeClone.forceSinglePass = true),
        (refractionFreeClone.onBeforeCompile = sourceMaterialNode.onBeforeCompile),
        (refractionFreeClone.customProgramCacheKey = () =>
          sourceMaterialNode.customProgramCacheKey() + "|reflection-no-refraction"));
      const handleCloneDispose = () => {
        (sourceMaterialNode.removeEventListener("dispose", handleCloneDispose),
          cloneByMaterial.delete(sourceMaterialNode),
          disposeByClone.delete(refractionFreeClone),
          refractionFreeClone.dispose());
      };
      (sourceMaterialNode.addEventListener("dispose", handleCloneDispose),
        cloneByMaterial.set(sourceMaterialNode, refractionFreeClone),
        disposeByClone.set(refractionFreeClone, handleCloneDispose));
    }
    return cloneByMaterial.get(sourceMaterialNode);
  }
  function resolveFadeMaterial(baseMaterial) {
    const refractionFreeMaterialNode = getRefractionFreeMaterial(baseMaterial);
    if (
      !(fadeHeight > 0) ||
      !refractionFreeMaterialNode ||
      refractionFreeMaterialNode.isShaderMaterial
    )
      return refractionFreeMaterialNode;
    let fadeRecord = fadeRecordByMaterial.get(refractionFreeMaterialNode);
    if (
      (fadeRecord &&
        fadeRecord.version !== refractionFreeMaterialNode.version &&
        (fadeRecord.copy.copy(refractionFreeMaterialNode),
        (fadeRecord.copy.needsUpdate = true),
        (fadeRecord.version = refractionFreeMaterialNode.version)),
      !fadeRecord)
    ) {
      const fadedClone = refractionFreeMaterialNode.clone();
      ((fadedClone.onBeforeCompile = function (shader, webglRenderer) {
        (refractionFreeMaterialNode.onBeforeCompile.call(this, shader, webglRenderer),
          Object.assign(shader.uniforms, reflectionUniforms),
          (shader.vertexShader =
            "uniform vec4 groundReflectionPlane;\nuniform mat4 groundReflectionViewToWorld;\nvarying float vGroundReflectionHeight;\n" +
            shader.vertexShader),
          (shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n          vGroundReflectionHeight = dot(groundReflectionPlane, groundReflectionViewToWorld * mvPosition);",
          )),
          (shader.fragmentShader =
            "uniform float groundReflectionFadeHeight;\nvarying float vGroundReflectionHeight;\n" +
            shader.fragmentShader),
          (shader.fragmentShader = shader.fragmentShader.replace(
            "#include <dithering_fragment>",
            "#include <dithering_fragment>\n          float groundReflectionFade = 1.0 - smoothstep(0.0, groundReflectionFadeHeight, max(0.0, vGroundReflectionHeight));\n          if (groundReflectionFade <= 0.001) discard;\n          gl_FragColor.a *= groundReflectionFade;\n          " +
              (!refractionFreeMaterialNode.transparent ||
              refractionFreeMaterialNode.premultipliedAlpha
                ? "gl_FragColor.rgb *= groundReflectionFade;"
                : ""),
          )));
      }),
        (fadedClone.customProgramCacheKey = () =>
          refractionFreeMaterialNode.customProgramCacheKey() + "|reflection-root-fade-v1"),
        (fadeRecord = {
          copy: fadedClone,
          version: refractionFreeMaterialNode.version,
          release() {
            (refractionFreeMaterialNode.removeEventListener("dispose", fadeRecord.release),
              fadeRecordByMaterial.delete(refractionFreeMaterialNode),
              fadedClone.dispose());
          },
        }),
        refractionFreeMaterialNode.addEventListener("dispose", fadeRecord.release),
        fadeRecordByMaterial.set(refractionFreeMaterialNode, fadeRecord));
    }
    const resolvedMaterial = fadeRecord.copy;
    for (const colorProperty of ["color", "emissive"])
      resolvedMaterial[colorProperty] &&
        refractionFreeMaterialNode[colorProperty] &&
        resolvedMaterial[colorProperty].copy(refractionFreeMaterialNode[colorProperty]);
    for (const materialProperty of [
      "opacity",
      "emissiveIntensity",
      "roughness",
      "metalness",
      "map",
      "alphaMap",
      "lightMap",
      "lightMapIntensity",
      "aoMap",
      "aoMapIntensity",
      "visible",
    ])
      materialProperty in refractionFreeMaterialNode &&
        (resolvedMaterial[materialProperty] = refractionFreeMaterialNode[materialProperty]);
    return (passes?.aliasMaterial?.(baseMaterial, resolvedMaterial), resolvedMaterial);
  }
  function resolveFadeMaterials(materialInput) {
    if (!Array.isArray(materialInput)) return resolveFadeMaterial(materialInput);
    let arrayRecord = fadeArrayByInput.get(materialInput);
    (arrayRecord ||
      ((arrayRecord = {
        next: [],
      }),
      fadeArrayByInput.set(materialInput, arrayRecord)),
      (arrayRecord.next.length = materialInput.length));
    let hasMaterialChanged = false;
    for (let materialIndex = 0; materialIndex < materialInput.length; materialIndex++)
      ((arrayRecord.next[materialIndex] = resolveFadeMaterial(materialInput[materialIndex])),
        (hasMaterialChanged ||= arrayRecord.next[materialIndex] !== materialInput[materialIndex]));
    return hasMaterialChanged ? arrayRecord.next : materialInput;
  }
  let activeRecords = [],
    currentRoot = null,
    rootFirstChild = null,
    shouldRefresh = true,
    lastRenderTimeMs = -Infinity,
    lastCameraSignature = "",
    lastLightingSignature = "",
    isDisposed = false,
    lastReceiverSignature = "",
    receiverMeshes = [],
    changeRevisionCount = 0,
    lastSceneRevision,
    isSuspended = false,
    isResumePending = false,
    resumeStartedAtMs = null,
    suspendStartedAtMs = null;
  const resumeFadeDurationMs = 160;
  let presentationGain = 1,
    throttleTimer = null,
    outsideFloorId = null,
    visibleFloorId = null,
    usageCounter = 0,
    resumeRecordSet = null;
  const recordsBySource = new Map(),
    floorChangeCountByFloorId = new Map(),
    cacheByteBudget = 32 * 1024 * 1024;
  let heightByFloorId = new Map(),
    lightsByFloorId = new Map(),
    nodeEntries = [],
    cachedTreeRoot = null,
    cachedTreeFirstChild = null,
    cachedTreeRevision;
  function rebuildNodeEntries(treeRoot, treeRevision) {
    if (
      getSceneRevision &&
      cachedTreeRoot === treeRoot &&
      cachedTreeFirstChild === treeRoot.children[0] &&
      cachedTreeRevision === treeRevision
    )
      return;
    ((nodeEntries = []),
      (cachedTreeRoot = treeRoot),
      (cachedTreeFirstChild = treeRoot.children[0]),
      (cachedTreeRevision = treeRevision));
    const collectNodeEntry = (treeNode, parentEntryIndex = -1) => {
      if (treeNode.userData.reflectionOverlay) return;
      const selfIndex = nodeEntries.length,
        sceneEntry = {
          object: treeNode,
          parent: parentEntryIndex,
          end: 0,
          id: "",
        };
      nodeEntries.push(sceneEntry);
      for (const traversedChild of treeNode.children) collectNodeEntry(traversedChild, selfIndex);
      sceneEntry.end = nodeEntries.length;
    };
    (collectNodeEntry(treeRoot), (stats.candidateBuilds = (stats.candidateBuilds || 0) + 1));
  }
  const readOwnFloorId = (floorNode) =>
      floorNode.userData.floorId ||
      floorNode.userData.regionFloorId ||
      floorNode.userData.environmentFloorId ||
      floorNode.userData.lightFloorId,
    traversalGroup = new three.Group();
  traversalGroup.traverse = (visitNode) => scene.traverseVisible(visitNode);
  function tryPrepareProgram(programRecord, compileCamera) {
    if (!renderer.compile || !renderer.extensions?.has("KHR_parallel_shader_compile")) return true;
    const glInstance = renderer.getContext();
    if (glInstance.isContextLost()) return false;
    let programWork = programRecord.programWork;
    if (
      !programWork ||
      programWork.context !== glInstance ||
      programWork.revision !== lastSceneRevision
    )
      return (
        renderer.compile(traversalGroup, compileCamera, scene),
        (programWork = programRecord.programWork =
          {
            context: glInstance,
            revision: lastSceneRevision,
            programs: [...renderer.info.programs],
            deadline: performance.now() + 4500,
            done: false,
          }),
        (stats.programPreparations = (stats.programPreparations || 0) + 1),
        false
      );
    if (programWork.done) return true;
    const programSet = new Set(renderer.info.programs),
      isLiveProgram = (program) =>
        programSet.has(program) && program.program && glInstance.isProgram(program.program);
    return (
      (programWork.done =
        performance.now() >= programWork.deadline ||
        programWork.programs.some((recordedProgram) => !isLiveProgram(recordedProgram)) ||
        programWork.programs.every((pendingProgram) => pendingProgram.isReady())),
      programWork.done && (programWork.programs = []),
      programWork.done
    );
  }
  function resolveFloorId(startNode) {
    for (let cursorNode = startNode; cursorNode; cursorNode = cursorNode.parent) {
      const ownFloorId =
        cursorNode.userData?.floorId ||
        cursorNode.userData?.regionFloorId ||
        cursorNode.userData?.environmentFloorId ||
        cursorNode.userData?.lightFloorId;
      if (ownFloorId) return String(ownFloorId);
    }
    return "";
  }
  const objectIdByObject = new WeakMap();
  let objectIdSequence = 0;
  function getObjectId(targetObject) {
    return targetObject
      ? (objectIdByObject.has(targetObject) ||
          objectIdByObject.set(targetObject, ++objectIdSequence),
        objectIdByObject.get(targetObject))
      : 0;
  }
  function geometrySignature(mesh) {
    const meshGeometry = mesh.geometry;
    return [
      meshGeometry.uuid,
      getObjectId(meshGeometry.index),
      meshGeometry.index?.version,
      ...Object.entries(meshGeometry.attributes).flatMap(([attributeName, attribute]) => [
        attributeName,
        getObjectId(attribute),
        attribute.version,
        attribute.data?.version,
        attribute.count,
      ]),
      meshGeometry.drawRange.start,
      meshGeometry.drawRange.count,
    ].join("|");
  }
  function isEligibleReceiver(candidateObject) {
    for (let walkedNode = candidateObject; walkedNode; walkedNode = walkedNode.parent)
      if (walkedNode.userData.courtyardSurface || walkedNode.userData.courtyardFoundation)
        return false;
    return (
      candidateObject.userData.backgroundThemeHidden !== true ||
      candidateObject.userData.groundReflectionReceiver === true
    );
  }
  function disposeRecord(recordToDispose) {
    (recordToDispose.geometry.removeEventListener("dispose", recordToDispose.onSourceDispose),
      recordToDispose.overlay.removeFromParent(),
      recordToDispose.overlay.geometry.dispose(),
      recordToDispose.overlay.material.dispose(),
      recordToDispose.map.dispose(),
      recordToDispose.scratch?.dispose(),
      recordsBySource.delete(recordToDispose.source));
  }
  function trimRecordCache() {
    const activeRecordSet = new Set(activeRecords),
      reclaimCandidates = [...recordsBySource.values()]
        .filter((candidateRecord) => !activeRecordSet.has(candidateRecord))
        .sort((recordA, recordB) => recordB.used - recordA.used);
    let totalBytes = 0,
      keptCount = 0;
    for (const candidate of reclaimCandidates) {
      const candidateBytes =
        candidate.map.width *
        candidate.map.height *
        (12 * (1 + candidate.map.samples) + (candidate.scratch ? 8 : 0));
      if (candidate.dead || keptCount >= 4 || totalBytes + candidateBytes > cacheByteBudget) {
        disposeRecord(candidate);
        continue;
      }
      ((totalBytes += candidateBytes), keptCount++);
    }
    ((stats.cachedRecords = keptCount), (stats.cachedBytes = totalBytes));
  }
  function buildLightingSignature(lights) {
    return lights
      .map((light) =>
        [
          light.uuid,
          isVisibleWithin(light),
          light.intensity,
          light.color?.r,
          light.color?.g,
          light.color?.b,
          light.distance,
          light.decay,
          light.angle,
          light.penumbra,
          ...light.matrixWorld.elements,
          ...(light.target?.matrixWorld.elements || []),
        ].join(","),
      )
      .join(";");
  }
  function recordStateKey(stateRecord) {
    return (
      visibleFloorId ??
      (stateRecord.kind === "outside" && outsideFloorId !== null
        ? outsideFloorId
        : resolveFloorId(stateRecord.source) || null)
    );
  }
  function recordLightingSignature(targetRecord, signatureByFloor) {
    const recordFloorId = recordStateKey(targetRecord);
    return [...heightByFloorId]
      .filter(
        ([entryFloorKey]) =>
          !floorLighting ||
          recordFloorId === null ||
          !entryFloorKey ||
          entryFloorKey === recordFloorId,
      )
      .map(([lookupFloorKey]) => signatureByFloor.get(lookupFloorKey))
      .join("|");
  }
  const isOnVisibleFloor = (targetNode) =>
    visibleFloorId === null || resolveFloorId(targetNode) === visibleFloorId;
  function isFloorTransitionLeaving(sourceObject) {
    for (let parentNode = sourceObject; parentNode; parentNode = parentNode.parent)
      if (parentNode.userData?.floorTransitionLeaving) return true;
    return false;
  }
  function isOnOutsideFloor(outsideSource) {
    if (outsideFloorId === null) return true;
    for (let outsideNode = outsideSource; outsideNode; outsideNode = outsideNode.parent) {
      const ancestorFloorId = outsideNode.userData?.floorId || outsideNode.userData?.regionFloorId;
      if (ancestorFloorId) return ancestorFloorId === outsideFloorId;
    }
    return false;
  }
  const blurScene = new three.Scene(),
    blurCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    blurMaterial = new three.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        source: {
          value: null,
        },
        step: {
          value: new three.Vector2(),
        },
      },
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:
        "uniform sampler2D source; uniform vec2 step; varying vec2 vUv;\n      void main(){ gl_FragColor=texture2D(source,vUv)*.227027;\n      gl_FragColor+=(texture2D(source,vUv+step*1.384615)+texture2D(source,vUv-step*1.384615))*.316216;\n      gl_FragColor+=(texture2D(source,vUv+step*3.230769)+texture2D(source,vUv-step*3.230769))*.070270; }",
    }),
    blurMesh = new three.Mesh(new three.PlaneGeometry(2, 2), blurMaterial);
  blurScene.add(blurMesh);
  const createReflectionTarget = (resolutionPx, forBlurPass = false) =>
    new three.WebGLRenderTarget(resolutionPx, resolutionPx, {
      type: three.HalfFloatType,
      depthBuffer: !forBlurPass,
      samples: forBlurPass ? 0 : Math.min(2, renderer.capabilities.maxSamples),
    });
  function disposeAllRecords() {
    resumeRecordSet = null;
    for (const storedRecord of [...recordsBySource.values()]) disposeRecord(storedRecord);
    ((activeRecords = []), (receiverMeshes = []), (stats.cachedRecords = stats.cachedBytes = 0));
  }
  function rebuildRecords(sceneRevision) {
    const resolvedRoot = getRoot();
    if (!resolvedRoot) {
      (disposeAllRecords(),
        (currentRoot = rootFirstChild = cachedTreeRoot = null),
        (nodeEntries = []));
      return;
    }
    (rebuildNodeEntries(resolvedRoot, sceneRevision),
      (!getSceneRevision ||
        lastSceneRevision !== sceneRevision ||
        currentRoot !== resolvedRoot ||
        rootFirstChild !== resolvedRoot.children[0]) &&
        ((receiverMeshes = []),
        resolvedRoot.traverse((traversedReceiver) => {
          traversedReceiver.isMesh &&
            !traversedReceiver.userData.floorPlanGroundShadow &&
            traversedReceiver.userData.batchedWallContactShadowCount == null &&
            (traversedReceiver.userData.regionReceiverKind === "floor" ||
              traversedReceiver.userData.exportRole === "background") &&
            receiverMeshes.push(traversedReceiver);
        })));
    const receiverSignature = receiverMeshes
      .map(
        (receiverEntry) => receiverEntry.uuid + ":" + (isEligibleReceiver(receiverEntry) ? 1 : 0),
      )
      .join("|");
    if (
      lastSceneRevision === sceneRevision &&
      currentRoot === resolvedRoot &&
      rootFirstChild === resolvedRoot.children[0] &&
      receiverSignature === lastReceiverSignature &&
      activeRecords.every(
        (knownRecord) =>
          knownRecord.source.parent && !knownRecord.dead && isEligibleReceiver(knownRecord.source),
      )
    )
      return;
    for (const staleRecord of activeRecords)
      ((staleRecord.overlay.visible = false), staleRecord.overlay.removeFromParent());
    ((activeRecords = []),
      (lastSceneRevision = sceneRevision),
      (currentRoot = resolvedRoot),
      (rootFirstChild = resolvedRoot.children[0]),
      (lastReceiverSignature = receiverSignature),
      currentRoot.updateWorldMatrix(true, true),
      (heightByFloorId = new Map()),
      (lightsByFloorId = new Map()));
    const heightBox = new three.Box3();
    currentRoot.traverse((traversedNode) => {
      if (traversedNode.userData?.reflectionOverlay || traversedNode.userData?.environmentEffect)
        return;
      const traversedFloorId = resolveFloorId(traversedNode);
      if (
        (traversedNode.isLight &&
          (lightsByFloorId.has(traversedFloorId) || lightsByFloorId.set(traversedFloorId, []),
          lightsByFloorId.get(traversedFloorId).push(traversedNode)),
        !traversedNode.isMesh || !traversedNode.geometry)
      )
        return;
      (traversedNode.geometry.boundingBox || traversedNode.geometry.computeBoundingBox(),
        traversedNode.isInstancedMesh && traversedNode.computeBoundingBox());
      const localBounds = traversedNode.isInstancedMesh
          ? traversedNode.boundingBox
          : traversedNode.geometry.boundingBox,
        topWorldY =
          traversedNode.isSkinnedMesh || traversedNode.morphTargetInfluences?.length
            ? Infinity
            : localBounds
              ? heightBox.copy(localBounds).applyMatrix4(traversedNode.matrixWorld).max.y
              : Infinity;
      heightByFloorId.set(
        traversedFloorId,
        Math.max(heightByFloorId.get(traversedFloorId) ?? -Infinity, topWorldY),
      );
    });
    const eligibleReceivers = receiverMeshes.filter(isEligibleReceiver);
    for (const sourceMesh of eligibleReceivers) {
      const receiverKind = sourceMesh.userData.exportRole === "background" ? "outside" : "inside";
      if (
        isFloorTransitionLeaving(sourceMesh) ||
        !isOnVisibleFloor(sourceMesh) ||
        (settings.mode !== "all" && receiverKind !== settings.mode) ||
        (receiverKind === "outside" && !isOnOutsideFloor(sourceMesh))
      )
        continue;
      const sourceBounds = new three.Box3().setFromObject(sourceMesh),
        sourceHeight = sourceBounds.max.y,
        sourceKey = geometrySignature(sourceMesh);
      let record = recordsBySource.get(sourceMesh);
      if (
        (record &&
          (record.dead || record.key !== sourceKey) &&
          (disposeRecord(record), (record = null)),
        record)
      ) {
        ((record.height = sourceHeight),
          (record.used = ++usageCounter),
          (record.hasCapture = false),
          record.overlay.position.copy(sourceMesh.position),
          record.overlay.quaternion.copy(sourceMesh.quaternion),
          record.overlay.scale.copy(sourceMesh.scale),
          sourceMesh.parent.add(record.overlay),
          activeRecords.push(record),
          stats.reuses++);
        continue;
      }
      const reflectionTarget = createReflectionTarget(settings.resolution),
        blurTarget = blur ? createReflectionTarget(settings.resolution, true) : null,
        reflectionMatrix = new three.Matrix4(),
        reflectionMaterial = new three.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
          uniforms: {
            reflection: {
              value: reflectionTarget.texture,
            },
            reflectionMatrix: {
              value: reflectionMatrix,
            },
            strength: {
              value: settings.strength,
            },
          },
          vertexShader:
            "uniform mat4 reflectionMatrix; varying vec4 reflected; varying float up;\n          void main(){vec4 world=modelMatrix*vec4(position,1.);reflected=reflectionMatrix*world;\n          up=normalize(mat3(modelMatrix)*normal).y;gl_Position=projectionMatrix*viewMatrix*world;}",
          fragmentShader:
            "uniform sampler2D reflection; uniform float strength; varying vec4 reflected; varying float up;\n          void main(){if(up<.9||reflected.w<=0.)discard;vec2 uv=reflected.xy/reflected.w;\n          if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;\n          vec4 value=texture2D(reflection,uv);gl_FragColor=vec4(value.rgb/max(value.a,.001),clamp(value.a*strength,0.,.7));\n          #include <tonemapping_fragment>\n          #include <colorspace_fragment>\n          }",
        }),
        overlayMesh = new three.Mesh(sourceMesh.geometry.clone(), reflectionMaterial);
      (overlayMesh.position.copy(sourceMesh.position),
        overlayMesh.quaternion.copy(sourceMesh.quaternion),
        overlayMesh.scale.copy(sourceMesh.scale),
        (overlayMesh.renderOrder = 1),
        (overlayMesh.userData.environmentEffect = true),
        (overlayMesh.userData.reflectionOverlay = true),
        (overlayMesh.userData.externalModelSharedGeometry =
          overlayMesh.userData.externalModelSharedMaterial =
          overlayMesh.userData.externalModelSharedTextures =
            true),
        (record = {
          source: sourceMesh,
          geometry: sourceMesh.geometry,
          kind: receiverKind,
          height: sourceHeight,
          overlay: overlayMesh,
          map: reflectionTarget,
          scratch: blurTarget,
          matrix: reflectionMatrix,
          key: sourceKey,
          used: ++usageCounter,
          state: "",
          dead: false,
          hasCapture: false,
        }),
        (record.onSourceDispose = () => {
          ((record.dead = true), (overlayMesh.visible = false));
        }),
        sourceMesh.geometry.addEventListener("dispose", record.onSourceDispose),
        recordsBySource.set(sourceMesh, record),
        stats.allocations++,
        sourceMesh.parent.add(overlayMesh),
        activeRecords.push(record));
    }
    (detail?.prepare(currentRoot),
      passes?.prepare(currentRoot),
      trimRecordCache(),
      (shouldRefresh = true));
  }
  function isVisibleWithin(checkedObject) {
    for (let checkedNode = checkedObject; checkedNode; checkedNode = checkedNode.parent)
      if (!checkedNode.visible) return false;
    return true;
  }
  function shouldShowRecord(recordToCheck) {
    return (
      isOnVisibleFloor(recordToCheck.source) &&
      (settings.mode === "all" || settings.mode === recordToCheck.kind) &&
      (recordToCheck.kind !== "outside" || isOnOutsideFloor(recordToCheck.source))
    );
  }
  function configure(nextSettings) {
    const normalizedSettings = normalizeGroundReflection(nextSettings);
    if (
      normalizedSettings.mode === settings.mode &&
      normalizedSettings.resolution === settings.resolution &&
      normalizedSettings.strength === settings.strength
    )
      return false;
    const hasResolutionChanged = settings.resolution !== normalizedSettings.resolution,
      hasModeChanged = settings.mode !== normalizedSettings.mode;
    return (
      Object.assign(settings, normalizedSettings),
      (hasResolutionChanged ||
        normalizedSettings.mode === "off" ||
        normalizedSettings.strength === 0) &&
        (disposeAllRecords(), (rootFirstChild = null)),
      hasModeChanged && (rootFirstChild = null),
      (shouldRefresh ||= hasResolutionChanged || hasModeChanged),
      requestFrame(),
      true
    );
  }
  function updateReflectionCamera(sourceCamera, mirrorPlane, textureMatrix) {
    let reflectionCamera = reflectionCameraBySource.get(sourceCamera);
    (reflectionCamera ||
      ((reflectionCamera = sourceCamera.clone(false)),
      reflectionCameraBySource.set(sourceCamera, reflectionCamera)),
      (reflectionCamera.layers.mask = sourceCamera.layers.mask));
    for (const cameraProperty of [
      "near",
      "far",
      "zoom",
      "fov",
      "aspect",
      "focus",
      "filmGauge",
      "filmOffset",
      "left",
      "right",
      "top",
      "bottom",
      "coordinateSystem",
    ])
      cameraProperty in sourceCamera &&
        (reflectionCamera[cameraProperty] = sourceCamera[cameraProperty]);
    const cameraWorldPosition = scratchWorldPosition.setFromMatrixPosition(
        sourceCamera.matrixWorld,
      ),
      cameraForward = scratchWorldNormal
        .setFromMatrixColumn(sourceCamera.matrixWorld, 2)
        .negate()
        .normalize();
    (cameraWorldPosition.addScaledVector(
      mirrorPlane.normal,
      -2 * mirrorPlane.distanceToPoint(cameraWorldPosition),
    ),
      cameraForward.reflect(mirrorPlane.normal),
      reflectionCamera.position.copy(cameraWorldPosition),
      reflectionCamera.up
        .setFromMatrixColumn(sourceCamera.matrixWorld, 1)
        .normalize()
        .reflect(mirrorPlane.normal),
      reflectionCamera.lookAt(scratchLookTarget.copy(cameraWorldPosition).add(cameraForward)),
      reflectionCamera.updateMatrixWorld(true),
      reflectionCamera.projectionMatrix.copy(sourceCamera.projectionMatrix),
      (reflectionCamera.projectionMatrix.elements[8] *= -1),
      (reflectionCamera.projectionMatrix.elements[12] *= -1),
      textureMatrix
        .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(reflectionCamera.projectionMatrix)
        .multiply(reflectionCamera.matrixWorldInverse));
    const planeInCameraSpace = scratchPlane
        .copy(mirrorPlane)
        .applyMatrix4(reflectionCamera.matrixWorldInverse),
      clipPlaneVector = scratchPlaneVector.set(
        planeInCameraSpace.normal.x,
        planeInCameraSpace.normal.y,
        planeInCameraSpace.normal.z,
        planeInCameraSpace.constant,
      ),
      projectionElements = reflectionCamera.projectionMatrix.elements,
      signVector = scratchSignVector
        .set(Math.sign(clipPlaneVector.x), Math.sign(clipPlaneVector.y), 1, 1)
        .applyMatrix4(scratchProjectionMatrix.copy(reflectionCamera.projectionMatrix).invert());
    return (
      clipPlaneVector.multiplyScalar(2 / clipPlaneVector.dot(signVector)),
      (projectionElements[2] = clipPlaneVector.x - projectionElements[3]),
      (projectionElements[6] = clipPlaneVector.y - projectionElements[7]),
      (projectionElements[10] = clipPlaneVector.z - projectionElements[11]),
      (projectionElements[14] = clipPlaneVector.w - projectionElements[15]),
      reflectionCamera.projectionMatrixInverse.copy(reflectionCamera.projectionMatrix).invert(),
      reflectionCamera
    );
  }
  function render(camera, { worldMatricesCurrent: worldMatricesCurrent = false } = {}) {
    if (isDisposed || stats.inCapture || !camera) return;
    if (isSuspended) {
      if (suspendStartedAtMs === null) return;
      const fadeOutProgress = Math.min(
        1,
        Math.max(0, (performance.now() - suspendStartedAtMs) / 240),
      );
      for (const fadingRecord of activeRecords) {
        let isUnderRoot = false;
        for (
          let ancestorNode = fadingRecord.source;
          ancestorNode;
          ancestorNode = ancestorNode.parent
        )
          if (ancestorNode === getRoot()) {
            isUnderRoot = true;
            break;
          }
        if (
          fadeOutProgress === 1 ||
          !isUnderRoot ||
          fadingRecord.dead ||
          !fadingRecord.hasCapture ||
          !fadingRecord.fadeOutStrength
        ) {
          ((fadingRecord.overlay.visible = false), fadingRecord.overlay.removeFromParent());
          continue;
        }
        (fadingRecord.source.updateWorldMatrix(true, false),
          fadingRecord.matrix
            .copy(fadingRecord.fadeOutMatrix)
            .multiply(fadingRecord.fadeOutFrame)
            .multiply(new three.Matrix4().copy(fadingRecord.source.matrixWorld).invert()),
          fadingRecord.overlay.position.copy(fadingRecord.source.position),
          fadingRecord.overlay.quaternion.copy(fadingRecord.source.quaternion),
          fadingRecord.overlay.scale.copy(fadingRecord.source.scale),
          fadingRecord.overlay.parent !== fadingRecord.source.parent &&
            fadingRecord.source.parent.add(fadingRecord.overlay),
          fadingRecord.overlay.updateWorldMatrix(true, false),
          (fadingRecord.overlay.material.uniforms.strength.value =
            fadingRecord.fadeOutStrength * (1 - fadeOutProgress)),
          (fadingRecord.overlay.visible = isVisibleWithin(
            fadingRecord.kind === "outside" ? fadingRecord.source.parent : fadingRecord.source,
          )));
      }
      fadeOutProgress < 1 ? requestFrame() : (suspendStartedAtMs = null);
      return;
    }
    if (
      settings.mode === "off" ||
      settings.strength === 0 ||
      (worldMatricesCurrent ||
        (scene.matrixWorldAutoUpdate && scene.updateMatrixWorld(),
        camera.updateWorldMatrix(true, false)),
      rebuildRecords(getSceneRevision?.()),
      !currentRoot)
    )
      return;
    const resumeProgress = isResumePending
      ? 0
      : resumeStartedAtMs === null
        ? 1
        : Math.min(1, (performance.now() - resumeStartedAtMs) / resumeFadeDurationMs);
    resumeProgress < 1 ? requestFrame() : (resumeStartedAtMs = null);
    for (const activeRecord of activeRecords) {
      if (!activeRecord.sourceFrame?.equals(activeRecord.source.matrixWorld)) {
        ((activeRecord.sourceFrame = (activeRecord.sourceFrame || new three.Matrix4()).copy(
          activeRecord.source.matrixWorld,
        )),
          activeRecord.source.geometry.boundingBox ||
            activeRecord.source.geometry.computeBoundingBox());
        const geometryBounds = activeRecord.source.geometry.boundingBox,
          geometrySize = geometryBounds.getSize(new three.Vector3()),
          thinAxis =
            geometrySize.x <= geometrySize.y && geometrySize.x <= geometrySize.z
              ? "x"
              : geometrySize.y <= geometrySize.z
                ? "y"
                : "z",
          planeNormal = new three.Vector3();
        ((planeNormal[thinAxis] = 1),
          planeNormal
            .applyMatrix3(new three.Matrix3().getNormalMatrix(activeRecord.sourceFrame))
            .normalize());
        const planeCenter = geometryBounds.getCenter(new three.Vector3());
        ((planeCenter[thinAxis] =
          planeNormal.y < 0 ? geometryBounds.min[thinAxis] : geometryBounds.max[thinAxis]),
          planeNormal.y < 0 && planeNormal.negate(),
          (activeRecord.plane = (
            activeRecord.plane || new three.Plane()
          ).setFromNormalAndCoplanarPoint(
            planeNormal,
            planeCenter.applyMatrix4(activeRecord.sourceFrame),
          )),
          (activeRecord.height = new three.Box3()
            .copy(geometryBounds)
            .applyMatrix4(activeRecord.sourceFrame).max.y),
          (shouldRefresh = true));
      }
      ((activeRecord.eligible =
        !isFloorTransitionLeaving(activeRecord.source) &&
        isVisibleWithin(
          activeRecord.kind === "outside" ? activeRecord.source.parent : activeRecord.source,
        ) &&
        shouldShowRecord(activeRecord) &&
        activeRecord.plane.distanceToPoint(getFloorCamera(camera, activeRecord.source).position) >
          0),
        (activeRecord.overlay.visible = activeRecord.eligible && activeRecord.hasCapture),
        (activeRecord.presentationBaseStrength = settings.strength * resumeProgress),
        (activeRecord.overlay.material.uniforms.strength.value =
          activeRecord.presentationBaseStrength * presentationGain));
    }
    if (settings.mode === "off" || !activeRecords.length) return;
    const frameStartMs = performance.now(),
      cameraSignature =
        camera.matrixWorld.elements.join(",") + camera.projectionMatrix.elements.join(","),
      hasCameraChanged = cameraSignature !== lastCameraSignature,
      currentResolution = settings.resolution;
    for (const resizedRecord of activeRecords)
      resizedRecord.map.width !== currentResolution &&
        (resizedRecord.map.setSize(currentResolution, currentResolution),
        resizedRecord.scratch?.setSize(currentResolution, currentResolution),
        (shouldRefresh = true));
    const lightingSignature =
        getStateKey() +
        "|" +
        changeRevisionCount +
        "|" +
        buildLightingSignature(lightsByFloorId.get("") || []) +
        "|" +
        (floorLighting ? "" : buildLightingSignature([...lightsByFloorId.values()].flat())),
      stateChanged =
        shouldRefresh || hasCameraChanged || lightingSignature !== lastLightingSignature,
      lightingSignatureByFloor = new Map(
        [...heightByFloorId.keys()].map((perFloorKey) => [
          perFloorKey,
          perFloorKey +
            ":" +
            (floorChangeCountByFloorId.get(perFloorKey) || 0) +
            ":" +
            (floorLighting ? buildLightingSignature(lightsByFloorId.get(perFloorKey) || []) : ""),
        ]),
      ),
      stateKeyByRecord = new Map();
    let dirtyRecords = activeRecords.filter((eligibleRecord) => {
      if (!eligibleRecord.eligible) return false;
      const stateKey = recordLightingSignature(eligibleRecord, lightingSignatureByFloor);
      return (
        stateKeyByRecord.set(eligibleRecord, stateKey),
        stateChanged || eligibleRecord.state !== stateKey
      );
    });
    if (
      (resumeRecordSet &&
        (dirtyRecords = dirtyRecords
          .filter((deferredRecord) => !resumeRecordSet.has(deferredRecord))
          .slice(0, Math.max(1, maxResumeCapturesPerFrame))),
      !dirtyRecords.length)
    )
      return;
    if (
      !shouldRefresh &&
      !hasCameraChanged &&
      frameStartMs - lastRenderTimeMs < 1000 / settings.fps
    ) {
      throttleTimer === null &&
        (throttleTimer = setTimeout(
          () => {
            ((throttleTimer = null), requestFrame());
          },
          1000 / settings.fps - (frameStartMs - lastRenderTimeMs),
        ));
      return;
    }
    const rendererState = {
        target: renderer.getRenderTarget(),
        cubeFace: renderer.getActiveCubeFace(),
        mipmap: renderer.getActiveMipmapLevel(),
        xr: renderer.xr.enabled,
        shadow: renderer.shadowMap.autoUpdate,
        alpha: renderer.getClearAlpha(),
        color: renderer.getClearColor(new three.Color()),
        background: scene.background,
        viewport: renderer.getViewport(new three.Vector4()),
        scissor: renderer.getScissor(new three.Vector4()),
        scissorTest: renderer.getScissorTest(),
        autoClear: renderer.autoClear,
        matrixWorldAutoUpdate: scene.matrixWorldAutoUpdate,
      },
      visibilityRestores = [],
      materialRestores = [],
      geometryRestores = [],
      wallMeshes = [],
      floorNodeEntries = [],
      allInside = dirtyRecords.every((allInsideRecord) => allInsideRecord.kind === "inside");
    let isCaptureDeferred = false,
      hasCaptured = false;
    culling.reset();
    const captureStartMs = performance.now();
    ((stats.inCapture = true), (stats.lastDrawCalls = stats.lastTriangles = 0));
    try {
      const prepareNode = (candidateNode, nodeId, ancestorId) => {
          if (!candidateNode.visible) return false;
          if (
            (candidateNode !== currentRoot &&
              visibleFloorId !== null &&
              nodeId &&
              nodeId !== visibleFloorId) ||
            candidateNode.userData.floorTransitionLeaving ||
            candidateNode.name === "interaction3d-curtain-shadow-refresh" ||
            candidateNode.userData.reflectionOverlay ||
            ["background", "grid", "outline"].includes(candidateNode.userData.exportRole) ||
            candidateNode.userData.regionReceiverKind === "floor" ||
            candidateNode.userData.environmentEffect ||
            candidateNode.userData.presenceId != null ||
            (allInside && candidateNode.userData.reflectionRole === "wall")
          )
            return (
              visibilityRestores.push([candidateNode, candidateNode.visible]),
              (candidateNode.visible = false),
              false
            );
          (candidateNode !== currentRoot &&
            nodeId &&
            nodeId !== ancestorId &&
            floorNodeEntries.push({
              object: candidateNode,
              id: nodeId,
            }),
            candidateNode.userData.reflectionRole === "wall" && wallMeshes.push(candidateNode),
            cull && culling.add(candidateNode, !floorLighting, nodeId));
          const detailGeometry = detail?.get(candidateNode);
          if (
            (detailGeometry &&
              (geometryRestores.push([candidateNode, candidateNode.geometry]),
              (candidateNode.geometry = detailGeometry)),
            candidateNode.isMesh && candidateNode.material)
          ) {
            const originalMaterial = candidateNode.material,
              materialForRender = resolveFadeMaterials(originalMaterial);
            materialForRender !== originalMaterial &&
              (materialRestores.push([candidateNode, originalMaterial]),
              (candidateNode.material = materialForRender));
          }
          return true;
        },
        prepareFloorNodes = (subtreeRoot, enclosingFloorId = "", fallbackFloorId = "") => {
          if (subtreeRoot === currentRoot) {
            for (const hideRecord of activeRecords)
              hideRecord.overlay.visible &&
                (visibilityRestores.push([hideRecord.overlay, true]),
                (hideRecord.overlay.visible = false));
            for (let entryIndex = 0; entryIndex < nodeEntries.length;) {
              const nodeEntry = nodeEntries[entryIndex],
                parentEntry = nodeEntries[nodeEntry.parent];
              nodeEntry.id = String(
                readOwnFloorId(nodeEntry.object) ||
                  (parentEntry ? parentEntry.id : fallbackFloorId),
              );
              const parentFloorId = parentEntry
                ? parentEntry.object === currentRoot
                  ? ""
                  : parentEntry.id
                : enclosingFloorId;
              entryIndex = prepareNode(nodeEntry.object, nodeEntry.id, parentFloorId)
                ? entryIndex + 1
                : nodeEntry.end;
            }
            return;
          }
          const nodeFloorId = String(readOwnFloorId(subtreeRoot) || fallbackFloorId);
          if (prepareNode(subtreeRoot, nodeFloorId, enclosingFloorId)) {
            for (const childNode of subtreeRoot.children)
              prepareFloorNodes(childNode, nodeFloorId, nodeFloorId);
          }
        };
      let isScenePrepared = false;
      ((scene.matrixWorldAutoUpdate = false),
        (renderer.xr.enabled = false),
        (renderer.shadowMap.autoUpdate = false),
        (renderer.autoClear = true),
        (scene.background = null),
        renderer.setClearColor(0, 0),
        renderer.setScissorTest(false));
      for (const captureRecord of dirtyRecords) {
        captureRecord.hasCapture = false;
        const capturedCamera = updateReflectionCamera(
          getFloorCamera(camera, captureRecord.source),
          captureRecord.plane,
          captureRecord.matrix,
        );
        if (
          (reflectionUniforms.groundReflectionPlane.value.set(
            captureRecord.plane.normal.x,
            captureRecord.plane.normal.y,
            captureRecord.plane.normal.z,
            captureRecord.plane.constant,
          ),
          reflectionUniforms.groundReflectionViewToWorld.value.copy(capturedCamera.matrixWorld),
          cull && !culling.prepare(captureRecord, capturedCamera))
        ) {
          ((captureRecord.state = stateKeyByRecord.get(captureRecord)),
            (captureRecord.preparedPose = cameraSignature),
            (captureRecord.preparedStateKey = lightingSignature),
            resumeRecordSet?.add(captureRecord));
          continue;
        }
        isScenePrepared || (prepareFloorNodes(scene), (isScenePrepared = true));
        const temporarilyHidden = [];
        try {
          const requiredFloorId = recordStateKey(captureRecord);
          if ((cull && culling.apply(requiredFloorId), requiredFloorId !== null)) {
            for (const { object: boundaryNode, id: boundaryFloorId } of floorNodeEntries)
              boundaryNode.visible &&
                boundaryFloorId !== requiredFloorId &&
                (temporarilyHidden.push(boundaryNode), (boundaryNode.visible = false));
          }
          if (captureRecord.kind === "inside") {
            for (const wallNode of wallMeshes)
              wallNode.visible && (temporarilyHidden.push(wallNode), (wallNode.visible = false));
          }
          if (
            (passes?.begin(scene, capturedCamera, currentResolution, requiredFloorId),
            syncLighting(capturedCamera),
            renderer.setRenderTarget(captureRecord.map),
            !tryPrepareProgram(captureRecord, capturedCamera))
          ) {
            isCaptureDeferred = true;
            continue;
          }
          (renderer.clear(),
            renderer.render(scene, capturedCamera),
            stats.renders++,
            (stats.lastDrawCalls += renderer.info?.render.calls || 0),
            (stats.lastTriangles += renderer.info?.render.triangles || 0));
        } finally {
          (passes?.restore(), culling.restore());
          for (const restoredNode of temporarilyHidden) restoredNode.visible = true;
        }
        if (captureRecord.scratch) {
          for (const [blurSource, blurDestination, sourceScale, destinationScale] of [
            [captureRecord.map, captureRecord.scratch, 1, 0],
            [captureRecord.scratch, captureRecord.map, 0, 1],
          ])
            ((blurMaterial.uniforms.source.value = blurSource.texture),
              blurMaterial.uniforms.step.value.set(
                (sourceScale * 2) / 512,
                (destinationScale * 2) / 512,
              ),
              renderer.setRenderTarget(blurDestination),
              renderer.clear(),
              renderer.render(blurScene, blurCamera));
        }
        (stats.captures++,
          (captureRecord.hasCapture = true),
          (hasCaptured = true),
          (captureRecord.capturedPose = captureRecord.preparedPose = cameraSignature),
          (captureRecord.capturedStateKey = captureRecord.preparedStateKey = lightingSignature),
          resumeRecordSet?.add(captureRecord),
          (captureRecord.state = stateKeyByRecord.get(captureRecord)));
      }
      isResumePending &&
        hasCaptured &&
        ((isResumePending = false), (resumeStartedAtMs = performance.now()), requestFrame());
      const hasPendingCaptures =
        resumeRecordSet &&
        activeRecords.some(
          (uncapturedRecord) => uncapturedRecord.eligible && !resumeRecordSet.has(uncapturedRecord),
        );
      ((shouldRefresh =
        isCaptureDeferred ||
        !!hasPendingCaptures ||
        activeRecords.some(
          (changedPoseRecord) =>
            changedPoseRecord.eligible &&
            changedPoseRecord.hasCapture &&
            (changedPoseRecord.capturedPose !== cameraSignature ||
              changedPoseRecord.capturedStateKey !== lightingSignature),
        )),
        hasPendingCaptures || (resumeRecordSet = null),
        shouldRefresh && requestFrame(),
        (lastRenderTimeMs = frameStartMs),
        (lastCameraSignature = cameraSignature),
        (lastLightingSignature = lightingSignature));
    } finally {
      ((scene.matrixWorldAutoUpdate = rendererState.matrixWorldAutoUpdate),
        passes?.restore(),
        culling.restore(),
        (stats.culling = {
          ...culling.stats,
        }));
      for (const [geometryMesh, savedGeometry] of geometryRestores)
        geometryMesh.geometry = savedGeometry;
      for (const [visibilityObject, previousVisible] of visibilityRestores)
        visibilityObject.visible = previousVisible;
      for (const [materialMesh, savedMaterial] of materialRestores)
        materialMesh.material = savedMaterial;
      for (const restoredRecord of activeRecords)
        restoredRecord.overlay.visible =
          restoredRecord.eligible &&
          restoredRecord.hasCapture &&
          restoredRecord.capturedPose === cameraSignature;
      ((scene.background = rendererState.background),
        renderer.setClearColor(rendererState.color, rendererState.alpha),
        renderer.setViewport(rendererState.viewport),
        renderer.setScissor(rendererState.scissor),
        renderer.setScissorTest(rendererState.scissorTest),
        renderer.setRenderTarget(
          rendererState.target,
          rendererState.cubeFace,
          rendererState.mipmap,
        ),
        (renderer.xr.enabled = rendererState.xr),
        (renderer.shadowMap.autoUpdate = rendererState.shadow),
        (renderer.autoClear = rendererState.autoClear),
        syncLighting(camera),
        (stats.inCapture = false),
        (stats.lastMs = performance.now() - captureStartMs),
        (stats.totalMs += stats.lastMs));
    }
  }
  return {
    settings: settings,
    stats: stats,
    render: render,
    configure: configure,
    setVisibleFloor(nextFloorId) {
      const normalizedFloorId = nextFloorId == null ? null : String(nextFloorId);
      if (normalizedFloorId !== visibleFloorId) {
        visibleFloorId = normalizedFloorId;
        for (const floorRecord of activeRecords)
          isOnVisibleFloor(floorRecord.source) ||
            ((floorRecord.overlay.visible = false), floorRecord.overlay.removeFromParent());
        ((rootFirstChild = null), (shouldRefresh = true), requestFrame());
      }
    },
    setOutsideFloor(nextOutsideFloorId) {
      const normalizedOutsideFloorId =
        nextOutsideFloorId == null ? null : String(nextOutsideFloorId);
      if (normalizedOutsideFloorId !== outsideFloorId) {
        outsideFloorId = normalizedOutsideFloorId;
        for (const outsideRecord of activeRecords)
          outsideRecord.kind === "outside" &&
            !isOnOutsideFloor(outsideRecord.source) &&
            (outsideRecord.overlay.visible = false);
        ((rootFirstChild = null), (shouldRefresh = true), requestFrame());
      }
    },
    setPresentationGain(requestedGain) {
      const normalizedGain = Math.min(
        1,
        Math.max(0, Number.isFinite(requestedGain) ? requestedGain : 1),
      );
      if (!(isDisposed || normalizedGain === presentationGain)) {
        presentationGain = normalizedGain;
        for (const strengthRecord of activeRecords)
          strengthRecord.overlay.material.uniforms.strength.value =
            (strengthRecord.presentationBaseStrength ?? settings.strength) * normalizedGain;
        requestFrame();
      }
    },
    isPrepared: () =>
      isDisposed ||
      isSuspended ||
      settings.mode === "off" ||
      settings.strength === 0 ||
      (!shouldRefresh &&
        activeRecords.every(
          (checkedRecord) =>
            !checkedRecord.eligible ||
            (checkedRecord.preparedPose === lastCameraSignature &&
              checkedRecord.preparedStateKey === lastLightingSignature),
        )),
    setSuspended(suspended, { fade: fade = false, fadeIn: fadeIn = true } = {}) {
      const shouldSuspend = suspended === true;
      if (isSuspended === shouldSuspend) {
        if (shouldSuspend) {
          for (const hiddenRecord of activeRecords)
            ((hiddenRecord.overlay.visible = false), hiddenRecord.overlay.removeFromParent());
        }
        shouldSuspend && !fade && (suspendStartedAtMs = null);
        return;
      }
      ((isSuspended = shouldSuspend),
        (resumeStartedAtMs = null),
        (isResumePending = !isSuspended && fadeIn),
        (resumeRecordSet =
          !isSuspended && Number.isFinite(maxResumeCapturesPerFrame) ? new Set() : null),
        (suspendStartedAtMs = isSuspended && fade ? performance.now() : null));
      for (const suspendRecord of activeRecords)
        (isSuspended &&
          fade &&
          ((suspendRecord.fadeOutStrength = suspendRecord.overlay.visible
            ? suspendRecord.overlay.material.uniforms.strength.value
            : 0),
          (suspendRecord.fadeOutMatrix = suspendRecord.matrix.clone()),
          suspendRecord.source.updateWorldMatrix(true, false),
          (suspendRecord.fadeOutFrame = suspendRecord.source.matrixWorld.clone())),
          (suspendRecord.overlay.visible = false),
          suspendRecord.overlay.removeFromParent());
      ((shouldRefresh = true), isSuspended || (rootFirstChild = null), requestFrame());
    },
    get records() {
      return activeRecords;
    },
    invalidate() {
      shouldRefresh = true;
    },
    invalidateContext() {
      if (!isDisposed) {
        (clearTimeout(throttleTimer), (throttleTimer = null));
        for (const cachedRecord of recordsBySource.values())
          ((cachedRecord.hasCapture = false),
            (cachedRecord.state = null),
            (cachedRecord.overlay.visible = false),
            (cachedRecord.programWork = null));
        ((resumeRecordSet =
          !isSuspended && Number.isFinite(maxResumeCapturesPerFrame) ? new Set() : null),
          (suspendStartedAtMs = null),
          (shouldRefresh = true),
          (lastRenderTimeMs = -Infinity),
          requestFrame());
      }
    },
    changed(changedFloorIds) {
      if (changedFloorIds == null) changeRevisionCount++;
      else
        for (const changedFloorId of new Set(changedFloorIds)) {
          if (!changedFloorId || !heightByFloorId.has(String(changedFloorId))) {
            changeRevisionCount++;
            continue;
          }
          floorChangeCountByFloorId.set(
            String(changedFloorId),
            (floorChangeCountByFloorId.get(String(changedFloorId)) || 0) + 1,
          );
        }
    },
    dispose() {
      ((isDisposed = true), (nodeEntries = []), (cachedTreeRoot = null));
      for (const fadedRecord of [...fadeRecordByMaterial.values()]) fadedRecord.release();
      (passes?.dispose(),
        detail?.dispose(),
        clearTimeout(throttleTimer),
        disposeAllRecords(),
        blurMesh.geometry.dispose(),
        blurMaterial.dispose());
      for (const disposeClone of [...disposeByClone.values()]) disposeClone();
      (floorChangeCountByFloorId.clear(), heightByFloorId.clear(), lightsByFloorId.clear());
    },
  };
}
