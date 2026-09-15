import { normalizeGroundReflection } from "../modules/interaction3d/reflection-settings.js";
import { createReflectionCulling } from "./studio-reflection-culling.js?v=20260915211726";
export function createGroundReflections({
  THREE: THREE,
  renderer: renderer,
  scene: scene,
  getRoot: getRoot,
  syncLighting: syncLighting,
  getFloorCamera: getFloorCamera = fallbackCamera => fallbackCamera,
  getStateKey: getStateKey = () => "",
  getSceneRevision: getSceneRevision = () => "",
  floorLighting: floorLighting = false,
  detail: detail = null,
  cull: cull = true,
  blur: blur = true,
  requestFrame: requestFrame = () => {}
}) {
  const settings = {
    ...normalizeGroundReflection(),
    fps: 30
  };
  const culling = createReflectionCulling(THREE);
  const stats = {
    captures: 0,
    renders: 0,
    lastMs: 0,
    totalMs: 0,
    allocations: 0,
    reuses: 0,
    cachedRecords: 0,
    cachedBytes: 0,
    inCapture: false
  };
  const refractionFreeMaterialBySource = new WeakMap();
  const disposeHandlerByClone = new Map();
  const materialArrayEntryByInput = new WeakMap();
  const reflectionCameraBySource = new WeakMap();
  const scratchWorldPosition = new THREE.Vector3();
  const scratchWorldNormal = new THREE.Vector3();
  const scratchLookTarget = new THREE.Vector3();
  const scratchPlane = new THREE.Plane();
  const scratchPlaneVector = new THREE.Vector4();
  const scratchSignVector = new THREE.Vector4();
  const scratchProjectionMatrix = new THREE.Matrix4();
  function cloneMaterialSharingRenderTargets(material) {
    const renderTargetUniforms = [];
    const uniforms = material.uniforms;
    if (uniforms) {
      for (const uniformName of Object.keys(uniforms)) {
        const uniform = uniforms[uniformName];
        const texture = uniform?.value;
        if (texture?.isTexture && texture.isRenderTargetTexture) {
          renderTargetUniforms.push([uniformName, texture]);
          uniform.value = null;
        }
      }
    }
    let clonedMaterial;
    try {
      clonedMaterial = material.clone();
    } finally {
      for (const [uniformName, texture] of renderTargetUniforms) {
        uniforms[uniformName].value = texture;
        if (clonedMaterial?.uniforms?.[uniformName]) {
          clonedMaterial.uniforms[uniformName].value = texture;
        }
      }
    }
    return clonedMaterial;
  }
  function getRefractionFreeMaterial(material) {
    if (!material || (!(material.transmission > 0) && !material.userData.alphaWallBand)) {
      return material;
    }
    if (!refractionFreeMaterialBySource.has(material)) {
      const refractionFreeMaterial = cloneMaterialSharingRenderTargets(material);
      refractionFreeMaterial.transmission = 0;
      refractionFreeMaterial.forceSinglePass = true;
      refractionFreeMaterial.onBeforeCompile = material.onBeforeCompile;
      refractionFreeMaterial.customProgramCacheKey = () =>
        material.customProgramCacheKey() + "|reflection-no-refraction";
      const handleMaterialDispose = () => {
        material.removeEventListener("dispose", handleMaterialDispose);
        refractionFreeMaterialBySource.delete(material);
        disposeHandlerByClone.delete(refractionFreeMaterial);
        refractionFreeMaterial.dispose();
      };
      material.addEventListener("dispose", handleMaterialDispose);
      refractionFreeMaterialBySource.set(material, refractionFreeMaterial);
      disposeHandlerByClone.set(refractionFreeMaterial, handleMaterialDispose);
    }
    return refractionFreeMaterialBySource.get(material);
  }
  function getRefractionFreeMaterials(materialInput) {
    if (!Array.isArray(materialInput)) {
      return getRefractionFreeMaterial(materialInput);
    }
    let cachedArrayEntry = materialArrayEntryByInput.get(materialInput);
    if (!cachedArrayEntry) {
      cachedArrayEntry = {
        next: []
      };
      materialArrayEntryByInput.set(materialInput, cachedArrayEntry);
    }
    cachedArrayEntry.next.length = materialInput.length;
    let materialArrayChanged = false;
    for (let materialIndex = 0; materialIndex < materialInput.length; materialIndex++) {
      cachedArrayEntry.next[materialIndex] = getRefractionFreeMaterial(
        materialInput[materialIndex]
      );
      materialArrayChanged ||=
        cachedArrayEntry.next[materialIndex] !== materialInput[materialIndex];
    }
    if (materialArrayChanged) {
      return cachedArrayEntry.next;
    } else {
      return materialInput;
    }
  }
  let recordList = [];
  let currentRoot = null;
  let rootFirstChild = null;
  let needsUpdate = true;
  let lastRenderTimeMs = -Infinity;
  let lastCameraSignature = "";
  let lastLightingSignature = "";
  let isDisposed = false;
  let changeRevisionCount = 0;
  let lastSceneRevision;
  let isSuspended = false;
  let pendingResume = false;
  let resumeStartedAtMs = null;
  let suspendStartedAtMs = null;
  const FADE_DURATION_MS = 240;
  let throttleTimer = null;
  let outsideFloorId = null;
  let visibleFloorId = null;
  let usageCounter = 0;
  const recordsBySource = new Map();
  const floorChangeCounts = new Map();
  const CACHE_BYTE_BUDGET = 33554432;
  let heightByFloorId = new Map();
  let lightsByFloorId = new Map();
  function resolveFloorId(startObject) {
    for (let currentObject = startObject; currentObject; currentObject = currentObject.parent) {
      const userDataFloorId =
        currentObject.userData?.floorId ||
        currentObject.userData?.regionFloorId ||
        currentObject.userData?.environmentFloorId ||
        currentObject.userData?.lightFloorId;
      if (userDataFloorId) {
        return String(userDataFloorId);
      }
    }
    return "";
  }
  const objectIdByObject = new WeakMap();
  let objectIdSequence = 0;
  function getObjectId(targetObject) {
    if (targetObject) {
      if (!objectIdByObject.has(targetObject)) {
        objectIdByObject.set(targetObject, ++objectIdSequence);
      }
      return objectIdByObject.get(targetObject);
    } else {
      return 0;
    }
  }
  function geometrySignature(mesh) {
    const geometry = mesh.geometry;
    return [
      geometry.uuid,
      getObjectId(geometry.index),
      geometry.index?.version,
      ...Object.entries(geometry.attributes).flatMap(([attributeName, attribute]) => [
        attributeName,
        getObjectId(attribute),
        attribute.version,
        attribute.data?.version,
        attribute.count
      ]),
      geometry.drawRange.start,
      geometry.drawRange.count
    ].join("|");
  }
  function disposeRecord(recordToDispose) {
    recordToDispose.geometry.removeEventListener("dispose", recordToDispose.onSourceDispose);
    recordToDispose.overlay.removeFromParent();
    recordToDispose.overlay.geometry.dispose();
    recordToDispose.overlay.material.dispose();
    recordToDispose.map.dispose();
    recordToDispose.scratch?.dispose();
    recordsBySource.delete(recordToDispose.source);
  }
  function trimRecordCache() {
    const activeRecords = new Set(recordList);
    const reclaimCandidates = [...recordsBySource.values()]
      .filter(candidateRecord => !activeRecords.has(candidateRecord))
      .sort((recordA, recordB) => recordB.used - recordA.used);
    let totalBytes = 0;
    let keptCount = 0;
    for (const candidate of reclaimCandidates) {
      const candidateBytes =
        candidate.map.width *
        candidate.map.height *
        ((1 + candidate.map.samples) * 12 + (candidate.scratch ? 8 : 0));
      if (candidate.dead || keptCount >= 4 || totalBytes + candidateBytes > CACHE_BYTE_BUDGET) {
        disposeRecord(candidate);
        continue;
      }
      totalBytes += candidateBytes;
      keptCount++;
    }
    stats.cachedRecords = keptCount;
    stats.cachedBytes = totalBytes;
  }
  function buildLightingSignature(lights) {
    return lights
      .map(light =>
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
          ...(light.target?.matrixWorld.elements || [])
        ].join(",")
      )
      .join(";");
  }
  function recordStateKey(targetRecord, floorLightingSignatures) {
    const effectiveFloorId =
      visibleFloorId ?? (targetRecord.kind === "outside" ? outsideFloorId : null);
    return [...heightByFloorId]
      .filter(
        ([floorKey, floorHeight]) =>
          (effectiveFloorId === null || !floorKey || floorKey === effectiveFloorId) &&
          (!floorLighting || !floorKey || floorHeight >= targetRecord.height - 0.1)
      )
      .map(([mapFloorKey]) => floorLightingSignatures.get(mapFloorKey))
      .join("|");
  }
  const isOnVisibleFloor = object =>
    visibleFloorId === null || resolveFloorId(object) === visibleFloorId;
  function isFloorTransitionLeaving(transitionSource) {
    for (
      let transitionNode = transitionSource;
      transitionNode;
      transitionNode = transitionNode.parent
    ) {
      if (transitionNode.userData?.floorTransitionLeaving) {
        return true;
      }
    }
    return false;
  }
  function isOnOutsideFloor(outsideSource) {
    if (outsideFloorId === null) {
      return true;
    }
    for (let outsideNode = outsideSource; outsideNode; outsideNode = outsideNode.parent) {
      const ancestorFloorId = outsideNode.userData?.floorId || outsideNode.userData?.regionFloorId;
      if (ancestorFloorId) {
        return ancestorFloorId === outsideFloorId;
      }
    }
    return false;
  }
  const blurScene = new THREE.Scene();
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blurMaterial = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      source: {
        value: null
      },
      step: {
        value: new THREE.Vector2()
      }
    },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:
      "uniform sampler2D source; uniform vec2 step; varying vec2 vUv;\n      void main(){ gl_FragColor=texture2D(source,vUv)*.227027;\n      gl_FragColor+=(texture2D(source,vUv+step*1.384615)+texture2D(source,vUv-step*1.384615))*.316216;\n      gl_FragColor+=(texture2D(source,vUv+step*3.230769)+texture2D(source,vUv-step*3.230769))*.070270; }"
  });
  const blurMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  blurScene.add(blurMesh);
  const createReflectionTarget = (resolutionPx, forBlurPass = false) =>
    new THREE.WebGLRenderTarget(resolutionPx, resolutionPx, {
      type: THREE.HalfFloatType,
      depthBuffer: !forBlurPass,
      samples: forBlurPass ? 0 : Math.min(2, renderer.capabilities.maxSamples)
    });
  function disposeAllRecords() {
    for (const existingRecord of [...recordsBySource.values()]) {
      disposeRecord(existingRecord);
    }
    recordList = [];
    stats.cachedRecords = stats.cachedBytes = 0;
  }
  function rebuildRecords(sceneRevision) {
    const resolvedRoot = getRoot();
    if (!resolvedRoot) {
      disposeAllRecords();
      currentRoot = rootFirstChild = null;
      return;
    }
    if (
      lastSceneRevision === sceneRevision &&
      currentRoot === resolvedRoot &&
      rootFirstChild === resolvedRoot.children[0] &&
      recordList.every(knownRecord => knownRecord.source.parent && !knownRecord.dead)
    ) {
      return;
    }
    for (const staleRecord of recordList) {
      staleRecord.overlay.visible = false;
      staleRecord.overlay.removeFromParent();
    }
    recordList = [];
    lastSceneRevision = sceneRevision;
    currentRoot = resolvedRoot;
    rootFirstChild = resolvedRoot.children[0];
    currentRoot.updateWorldMatrix(true, true);
    heightByFloorId = new Map();
    lightsByFloorId = new Map();
    const heightBox = new THREE.Box3();
    currentRoot.traverse(traversedNode => {
      if (traversedNode.userData?.reflectionOverlay || traversedNode.userData?.environmentEffect) {
        return;
      }
      const nodeFloorId = resolveFloorId(traversedNode);
      if (traversedNode.isLight) {
        if (!lightsByFloorId.has(nodeFloorId)) {
          lightsByFloorId.set(nodeFloorId, []);
        }
        lightsByFloorId.get(nodeFloorId).push(traversedNode);
      }
      if (!traversedNode.isMesh || !traversedNode.geometry) {
        return;
      }
      if (!traversedNode.geometry.boundingBox) {
        traversedNode.geometry.computeBoundingBox();
      }
      if (traversedNode.isInstancedMesh) {
        traversedNode.computeBoundingBox();
      }
      const localBounds = traversedNode.isInstancedMesh
        ? traversedNode.boundingBox
        : traversedNode.geometry.boundingBox;
      const topWorldY =
        traversedNode.isSkinnedMesh || traversedNode.morphTargetInfluences?.length
          ? Infinity
          : localBounds
            ? heightBox.copy(localBounds).applyMatrix4(traversedNode.matrixWorld).max.y
            : Infinity;
      heightByFloorId.set(
        nodeFloorId,
        Math.max(heightByFloorId.get(nodeFloorId) ?? -Infinity, topWorldY)
      );
    });
    const receiverMeshes = [];
    currentRoot.traverse(receiverNode => {
      if (
        receiverNode.isMesh &&
        (receiverNode.userData.regionReceiverKind === "floor" ||
          receiverNode.userData.exportRole === "background")
      ) {
        receiverMeshes.push(receiverNode);
      }
    });
    for (const sourceMesh of receiverMeshes) {
      const receiverKind = sourceMesh.userData.exportRole === "background" ? "outside" : "inside";
      if (
        isFloorTransitionLeaving(sourceMesh) ||
        !isOnVisibleFloor(sourceMesh) ||
        (settings.mode !== "all" && receiverKind !== settings.mode) ||
        (receiverKind === "outside" && !isOnOutsideFloor(sourceMesh))
      ) {
        continue;
      }
      const sourceBounds = new THREE.Box3().setFromObject(sourceMesh);
      const sourceHeight = sourceBounds.max.y;
      const sourceKey = geometrySignature(sourceMesh);
      let record = recordsBySource.get(sourceMesh);
      if (record && (record.dead || record.key !== sourceKey)) {
        disposeRecord(record);
        record = null;
      }
      if (record) {
        record.height = sourceHeight;
        record.used = ++usageCounter;
        record.hasCapture = false;
        record.overlay.position.copy(sourceMesh.position);
        record.overlay.quaternion.copy(sourceMesh.quaternion);
        record.overlay.scale.copy(sourceMesh.scale);
        sourceMesh.parent.add(record.overlay);
        recordList.push(record);
        stats.reuses++;
        continue;
      }
      const reflectionTarget = createReflectionTarget(settings.resolution);
      const blurTarget = blur ? createReflectionTarget(settings.resolution, true) : null;
      const reflectionMatrix = new THREE.Matrix4();
      const reflectionMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
        uniforms: {
          reflection: {
            value: reflectionTarget.texture
          },
          reflectionMatrix: {
            value: reflectionMatrix
          },
          strength: {
            value: settings.strength
          }
        },
        vertexShader:
          "uniform mat4 reflectionMatrix; varying vec4 reflected; varying float up;\n          void main(){vec4 world=modelMatrix*vec4(position,1.);reflected=reflectionMatrix*world;\n          up=normalize(mat3(modelMatrix)*normal).y;gl_Position=projectionMatrix*viewMatrix*world;}",
        fragmentShader:
          "uniform sampler2D reflection; uniform float strength; varying vec4 reflected; varying float up;\n          void main(){if(up<.9||reflected.w<=0.)discard;vec2 uv=reflected.xy/reflected.w;\n          if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;\n          vec4 value=texture2D(reflection,uv);gl_FragColor=vec4(value.rgb/max(value.a,.001),clamp(value.a*strength,0.,.7));\n          #include <tonemapping_fragment>\n          #include <colorspace_fragment>\n          }"
      });
      const overlayMesh = new THREE.Mesh(sourceMesh.geometry.clone(), reflectionMaterial);
      overlayMesh.position.copy(sourceMesh.position);
      overlayMesh.quaternion.copy(sourceMesh.quaternion);
      overlayMesh.scale.copy(sourceMesh.scale);
      overlayMesh.renderOrder = 1;
      overlayMesh.userData.environmentEffect = true;
      overlayMesh.userData.reflectionOverlay = true;
      overlayMesh.userData.externalModelSharedGeometry =
        overlayMesh.userData.externalModelSharedMaterial =
        overlayMesh.userData.externalModelSharedTextures =
          true;
      record = {
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
        hasCapture: false
      };
      record.onSourceDispose = () => {
        record.dead = true;
        overlayMesh.visible = false;
      };
      sourceMesh.geometry.addEventListener("dispose", record.onSourceDispose);
      recordsBySource.set(sourceMesh, record);
      stats.allocations++;
      sourceMesh.parent.add(overlayMesh);
      recordList.push(record);
    }
    detail?.prepare(currentRoot);
    trimRecordCache();
    needsUpdate = true;
  }
  function isVisibleWithin(startNode) {
    for (let visibilityNode = startNode; visibilityNode; visibilityNode = visibilityNode.parent) {
      if (!visibilityNode.visible) {
        return false;
      }
    }
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
    ) {
      return false;
    }
    const resolutionChanged = settings.resolution !== normalizedSettings.resolution;
    const modeChanged = settings.mode !== normalizedSettings.mode;
    Object.assign(settings, normalizedSettings);
    if (
      resolutionChanged ||
      normalizedSettings.mode === "off" ||
      normalizedSettings.strength === 0
    ) {
      disposeAllRecords();
      rootFirstChild = null;
    }
    if (modeChanged) {
      rootFirstChild = null;
    }
    needsUpdate ||= resolutionChanged || modeChanged;
    requestFrame();
    return true;
  }
  function updateReflectionCamera(sourceCamera, mirrorPlane, textureMatrix) {
    let reflectionCamera = reflectionCameraBySource.get(sourceCamera);
    if (!reflectionCamera) {
      reflectionCamera = sourceCamera.clone(false);
      reflectionCameraBySource.set(sourceCamera, reflectionCamera);
    }
    reflectionCamera.layers.mask = sourceCamera.layers.mask;
    for (const propertyName of [
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
      "coordinateSystem"
    ]) {
      if (propertyName in sourceCamera) {
        reflectionCamera[propertyName] = sourceCamera[propertyName];
      }
    }
    const cameraWorldPosition = scratchWorldPosition.setFromMatrixPosition(
      sourceCamera.matrixWorld
    );
    const cameraForward = scratchWorldNormal
      .setFromMatrixColumn(sourceCamera.matrixWorld, 2)
      .negate()
      .normalize();
    cameraWorldPosition.addScaledVector(
      mirrorPlane.normal,
      mirrorPlane.distanceToPoint(cameraWorldPosition) * -2
    );
    cameraForward.reflect(mirrorPlane.normal);
    reflectionCamera.position.copy(cameraWorldPosition);
    reflectionCamera.up
      .setFromMatrixColumn(sourceCamera.matrixWorld, 1)
      .normalize()
      .reflect(mirrorPlane.normal);
    reflectionCamera.lookAt(scratchLookTarget.copy(cameraWorldPosition).add(cameraForward));
    reflectionCamera.updateMatrixWorld(true);
    reflectionCamera.projectionMatrix.copy(sourceCamera.projectionMatrix);
    reflectionCamera.projectionMatrix.elements[8] *= -1;
    reflectionCamera.projectionMatrix.elements[12] *= -1;
    textureMatrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(reflectionCamera.projectionMatrix)
      .multiply(reflectionCamera.matrixWorldInverse);
    const planeInCameraSpace = scratchPlane
      .copy(mirrorPlane)
      .applyMatrix4(reflectionCamera.matrixWorldInverse);
    const clipPlaneVector = scratchPlaneVector.set(
      planeInCameraSpace.normal.x,
      planeInCameraSpace.normal.y,
      planeInCameraSpace.normal.z,
      planeInCameraSpace.constant
    );
    const projectionElements = reflectionCamera.projectionMatrix.elements;
    const signVector = scratchSignVector
      .set(Math.sign(clipPlaneVector.x), Math.sign(clipPlaneVector.y), 1, 1)
      .applyMatrix4(scratchProjectionMatrix.copy(reflectionCamera.projectionMatrix).invert());
    clipPlaneVector.multiplyScalar(2 / clipPlaneVector.dot(signVector));
    projectionElements[2] = clipPlaneVector.x - projectionElements[3];
    projectionElements[6] = clipPlaneVector.y - projectionElements[7];
    projectionElements[10] = clipPlaneVector.z - projectionElements[11];
    projectionElements[14] = clipPlaneVector.w - projectionElements[15];
    reflectionCamera.projectionMatrixInverse.copy(reflectionCamera.projectionMatrix).invert();
    return reflectionCamera;
  }
  function render(camera, { worldMatricesCurrent: worldMatricesCurrent = false } = {}) {
    if (isDisposed || stats.inCapture || !camera) {
      return;
    }
    if (isSuspended) {
      if (suspendStartedAtMs === null) {
        return;
      }
      const fadeOutProgress = Math.min(
        1,
        Math.max(0, (performance.now() - suspendStartedAtMs) / FADE_DURATION_MS)
      );
      for (const fadingRecord of recordList) {
        let isUnderRoot = false;
        for (
          let ancestorNode = fadingRecord.source;
          ancestorNode;
          ancestorNode = ancestorNode.parent
        ) {
          if (ancestorNode === getRoot()) {
            isUnderRoot = true;
            break;
          }
        }
        if (
          fadeOutProgress === 1 ||
          !isUnderRoot ||
          fadingRecord.dead ||
          !fadingRecord.hasCapture ||
          !fadingRecord.fadeOutStrength
        ) {
          fadingRecord.overlay.visible = false;
          fadingRecord.overlay.removeFromParent();
          continue;
        }
        fadingRecord.source.updateWorldMatrix(true, false);
        fadingRecord.matrix
          .copy(fadingRecord.fadeOutMatrix)
          .multiply(fadingRecord.fadeOutFrame)
          .multiply(new THREE.Matrix4().copy(fadingRecord.source.matrixWorld).invert());
        fadingRecord.overlay.position.copy(fadingRecord.source.position);
        fadingRecord.overlay.quaternion.copy(fadingRecord.source.quaternion);
        fadingRecord.overlay.scale.copy(fadingRecord.source.scale);
        if (fadingRecord.overlay.parent !== fadingRecord.source.parent) {
          fadingRecord.source.parent.add(fadingRecord.overlay);
        }
        fadingRecord.overlay.updateWorldMatrix(true, false);
        fadingRecord.overlay.material.uniforms.strength.value =
          fadingRecord.fadeOutStrength * (1 - fadeOutProgress);
        fadingRecord.overlay.visible = isVisibleWithin(
          fadingRecord.kind === "outside" ? fadingRecord.source.parent : fadingRecord.source
        );
      }
      if (fadeOutProgress < 1) {
        requestFrame();
      } else {
        suspendStartedAtMs = null;
      }
      return;
    }
    if (
      settings.mode === "off" ||
      settings.strength === 0 ||
      (worldMatricesCurrent ||
        (scene.matrixWorldAutoUpdate && scene.updateMatrixWorld(),
        camera.updateWorldMatrix(true, false)),
      rebuildRecords(getSceneRevision()),
      !currentRoot)
    ) {
      return;
    }
    const resumeProgress = pendingResume
      ? 0
      : resumeStartedAtMs === null
        ? 1
        : Math.min(1, (performance.now() - resumeStartedAtMs) / FADE_DURATION_MS);
    if (resumeProgress < 1) {
      requestFrame();
    } else {
      resumeStartedAtMs = null;
    }
    for (const activeRecord of recordList) {
      if (!activeRecord.sourceFrame?.equals(activeRecord.source.matrixWorld)) {
        activeRecord.sourceFrame = (activeRecord.sourceFrame || new THREE.Matrix4()).copy(
          activeRecord.source.matrixWorld
        );
        if (!activeRecord.source.geometry.boundingBox) {
          activeRecord.source.geometry.computeBoundingBox();
        }
        const geometryBounds = activeRecord.source.geometry.boundingBox;
        const geometrySize = geometryBounds.getSize(new THREE.Vector3());
        const thinAxis =
          geometrySize.x <= geometrySize.y && geometrySize.x <= geometrySize.z
            ? "x"
            : geometrySize.y <= geometrySize.z
              ? "y"
              : "z";
        const planeNormal = new THREE.Vector3();
        planeNormal[thinAxis] = 1;
        planeNormal
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(activeRecord.sourceFrame))
          .normalize();
        const planeCenter = geometryBounds.getCenter(new THREE.Vector3());
        planeCenter[thinAxis] =
          planeNormal.y < 0 ? geometryBounds.min[thinAxis] : geometryBounds.max[thinAxis];
        if (planeNormal.y < 0) {
          planeNormal.negate();
        }
        activeRecord.plane = (
          activeRecord.plane || new THREE.Plane()
        ).setFromNormalAndCoplanarPoint(
          planeNormal,
          planeCenter.applyMatrix4(activeRecord.sourceFrame)
        );
        activeRecord.height = new THREE.Box3()
          .copy(geometryBounds)
          .applyMatrix4(activeRecord.sourceFrame).max.y;
        needsUpdate = true;
      }
      activeRecord.eligible =
        !isFloorTransitionLeaving(activeRecord.source) &&
        isVisibleWithin(
          activeRecord.kind === "outside" ? activeRecord.source.parent : activeRecord.source
        ) &&
        shouldShowRecord(activeRecord) &&
        activeRecord.plane.distanceToPoint(getFloorCamera(camera, activeRecord.source).position) >
          0;
      activeRecord.overlay.visible = activeRecord.eligible && activeRecord.hasCapture;
      activeRecord.overlay.material.uniforms.strength.value = settings.strength * resumeProgress;
    }
    if (settings.mode === "off" || !recordList.length) {
      return;
    }
    const frameStartMs = performance.now();
    const cameraSignature =
      camera.matrixWorld.elements.join(",") + camera.projectionMatrix.elements.join(",");
    const cameraChanged = cameraSignature !== lastCameraSignature;
    const currentResolution = settings.resolution;
    for (const resizedRecord of recordList) {
      if (resizedRecord.map.width !== currentResolution) {
        resizedRecord.map.setSize(currentResolution, currentResolution);
        resizedRecord.scratch?.setSize(currentResolution, currentResolution);
        needsUpdate = true;
      }
    }
    const lightingSignature =
      getStateKey() +
      "|" +
      changeRevisionCount +
      "|" +
      buildLightingSignature(lightsByFloorId.get("") || []) +
      "|" +
      (floorLighting ? "" : buildLightingSignature([...lightsByFloorId.values()].flat()));
    const stateChanged =
      needsUpdate || cameraChanged || lightingSignature !== lastLightingSignature;
    const lightingSignatureByFloor = new Map(
      [...heightByFloorId.keys()].map(signatureFloorKey => [
        signatureFloorKey,
        signatureFloorKey +
          ":" +
          (floorChangeCounts.get(signatureFloorKey) || 0) +
          ":" +
          (floorLighting
            ? buildLightingSignature(lightsByFloorId.get(signatureFloorKey) || [])
            : "")
      ])
    );
    const stateKeyByRecord = new Map();
    const dirtyRecords = recordList.filter(eligibleRecord => {
      if (!eligibleRecord.eligible) {
        return false;
      }
      const stateKey = recordStateKey(eligibleRecord, lightingSignatureByFloor);
      stateKeyByRecord.set(eligibleRecord, stateKey);
      return stateChanged || eligibleRecord.state !== stateKey;
    });
    if (!dirtyRecords.length) {
      return;
    }
    if (!needsUpdate && !cameraChanged && frameStartMs - lastRenderTimeMs < 1000 / settings.fps) {
      if (throttleTimer === null) {
        throttleTimer = setTimeout(
          () => {
            throttleTimer = null;
            requestFrame();
          },
          1000 / settings.fps - (frameStartMs - lastRenderTimeMs)
        );
      }
      return;
    }
    const rendererState = {
      target: renderer.getRenderTarget(),
      cubeFace: renderer.getActiveCubeFace(),
      mipmap: renderer.getActiveMipmapLevel(),
      xr: renderer.xr.enabled,
      shadow: renderer.shadowMap.autoUpdate,
      alpha: renderer.getClearAlpha(),
      color: renderer.getClearColor(new THREE.Color()),
      background: scene.background,
      viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(),
      autoClear: renderer.autoClear,
      matrixWorldAutoUpdate: scene.matrixWorldAutoUpdate
    };
    const hiddenObjects = [];
    const materialRestores = [];
    const geometryRestores = [];
    const wallMeshes = [];
    const allInside = dirtyRecords.every(checkedRecord => checkedRecord.kind === "inside");
    culling.reset();
    const captureStartMs = performance.now();
    stats.inCapture = true;
    stats.lastDrawCalls = stats.lastTriangles = 0;
    try {
      const prepareNode = candidateNode => {
        if (!candidateNode.visible) {
          return;
        }
        if (
          (candidateNode !== currentRoot &&
            visibleFloorId !== null &&
            resolveFloorId(candidateNode) &&
            resolveFloorId(candidateNode) !== visibleFloorId) ||
          candidateNode.userData.floorTransitionLeaving ||
          candidateNode.name === "interaction3d-curtain-shadow-refresh" ||
          candidateNode.userData.reflectionOverlay ||
          ["background", "grid", "outline"].includes(candidateNode.userData.exportRole) ||
          candidateNode.userData.regionReceiverKind === "floor" ||
          candidateNode.userData.environmentEffect ||
          (allInside && candidateNode.userData.reflectionRole === "wall")
        ) {
          hiddenObjects.push([candidateNode, candidateNode.visible]);
          candidateNode.visible = false;
          return;
        }
        if (candidateNode.userData.reflectionRole === "wall") {
          wallMeshes.push(candidateNode);
        }
        if (cull) {
          culling.add(candidateNode, !floorLighting);
        }
        const replacementGeometry = detail?.get(candidateNode);
        if (replacementGeometry) {
          geometryRestores.push([candidateNode, candidateNode.geometry]);
          candidateNode.geometry = replacementGeometry;
        }
        if (candidateNode.isMesh && candidateNode.material) {
          const originalMaterial = candidateNode.material;
          const materialForRender = getRefractionFreeMaterials(originalMaterial);
          if (materialForRender !== originalMaterial) {
            materialRestores.push([candidateNode, originalMaterial]);
            candidateNode.material = materialForRender;
          }
        }
        for (const childNode of candidateNode.children) {
          prepareNode(childNode);
        }
      };
      prepareNode(scene);
      scene.matrixWorldAutoUpdate = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = true;
      scene.background = null;
      renderer.setClearColor(0, 0);
      renderer.setScissorTest(false);
      for (const captureRecord of dirtyRecords) {
        captureRecord.hasCapture = false;
        const capturedCamera = updateReflectionCamera(
          getFloorCamera(camera, captureRecord.source),
          captureRecord.plane,
          captureRecord.matrix
        );
        syncLighting(capturedCamera);
        const temporarilyHidden = [];
        try {
          if (cull && !culling.begin(captureRecord, capturedCamera)) {
            captureRecord.state = stateKeyByRecord.get(captureRecord);
            continue;
          }
          if (captureRecord.kind === "outside" && outsideFloorId !== null) {
            scene.traverse(sceneNode => {
              const traversedFloorId = resolveFloorId(sceneNode);
              if (
                sceneNode !== currentRoot &&
                sceneNode.visible &&
                traversedFloorId &&
                traversedFloorId !== outsideFloorId
              ) {
                temporarilyHidden.push(sceneNode);
                sceneNode.visible = false;
              }
            });
          }
          if (captureRecord.kind === "inside") {
            for (const wallMesh of wallMeshes) {
              if (wallMesh.visible) {
                temporarilyHidden.push(wallMesh);
                wallMesh.visible = false;
              }
            }
          }
          renderer.setRenderTarget(captureRecord.map);
          renderer.clear();
          renderer.render(scene, capturedCamera);
          stats.renders++;
          stats.lastDrawCalls += renderer.info?.render.calls || 0;
          stats.lastTriangles += renderer.info?.render.triangles || 0;
        } finally {
          culling.restore();
          for (const restoredObject of temporarilyHidden) {
            restoredObject.visible = true;
          }
        }
        if (captureRecord.scratch) {
          for (const [blurSource, blurDestination, sourceScale, destinationScale] of [
            [captureRecord.map, captureRecord.scratch, 1, 0],
            [captureRecord.scratch, captureRecord.map, 0, 1]
          ]) {
            blurMaterial.uniforms.source.value = blurSource.texture;
            blurMaterial.uniforms.step.value.set(
              (sourceScale * 2) / 512,
              (destinationScale * 2) / 512
            );
            renderer.setRenderTarget(blurDestination);
            renderer.clear();
            renderer.render(blurScene, blurCamera);
          }
        }
        stats.captures++;
        captureRecord.hasCapture = true;
        captureRecord.state = stateKeyByRecord.get(captureRecord);
      }
      if (pendingResume) {
        pendingResume = false;
        resumeStartedAtMs = performance.now();
        requestFrame();
      }
      needsUpdate = false;
      lastRenderTimeMs = frameStartMs;
      lastCameraSignature = cameraSignature;
      lastLightingSignature = lightingSignature;
    } finally {
      scene.matrixWorldAutoUpdate = rendererState.matrixWorldAutoUpdate;
      culling.restore();
      stats.culling = {
        ...culling.stats
      };
      for (const [restoredMesh, savedGeometry] of geometryRestores) {
        restoredMesh.geometry = savedGeometry;
      }
      for (const [visibilityObject, previousVisible] of hiddenObjects) {
        visibilityObject.visible = previousVisible;
      }
      for (const [materialMesh, savedMaterial] of materialRestores) {
        materialMesh.material = savedMaterial;
      }
      for (const restoredRecord of recordList) {
        restoredRecord.overlay.visible = restoredRecord.eligible && restoredRecord.hasCapture;
      }
      scene.background = rendererState.background;
      renderer.setClearColor(rendererState.color, rendererState.alpha);
      renderer.setRenderTarget(rendererState.target, rendererState.cubeFace, rendererState.mipmap);
      renderer.setViewport(rendererState.viewport);
      renderer.setScissor(rendererState.scissor);
      renderer.setScissorTest(rendererState.scissorTest);
      renderer.xr.enabled = rendererState.xr;
      renderer.shadowMap.autoUpdate = rendererState.shadow;
      renderer.autoClear = rendererState.autoClear;
      syncLighting(camera);
      stats.inCapture = false;
      stats.lastMs = performance.now() - captureStartMs;
      stats.totalMs += stats.lastMs;
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
        for (const floorRecord of recordList) {
          if (!isOnVisibleFloor(floorRecord.source)) {
            floorRecord.overlay.visible = false;
            floorRecord.overlay.removeFromParent();
          }
        }
        rootFirstChild = null;
        needsUpdate = true;
        requestFrame();
      }
    },
    setOutsideFloor(nextOutsideFloorId) {
      const normalizedOutsideFloorId =
        nextOutsideFloorId == null ? null : String(nextOutsideFloorId);
      if (normalizedOutsideFloorId !== outsideFloorId) {
        outsideFloorId = normalizedOutsideFloorId;
        for (const outsideRecord of recordList) {
          if (outsideRecord.kind === "outside" && !isOnOutsideFloor(outsideRecord.source)) {
            outsideRecord.overlay.visible = false;
          }
        }
        rootFirstChild = null;
        needsUpdate = true;
        requestFrame();
      }
    },
    setSuspended(suspended, { fade: fade = false } = {}) {
      const nextSuspended = suspended === true;
      if (isSuspended === nextSuspended) {
        if (nextSuspended) {
          for (const hiddenRecord of recordList) {
            hiddenRecord.overlay.visible = false;
            hiddenRecord.overlay.removeFromParent();
          }
        }
        if (nextSuspended && !fade) {
          suspendStartedAtMs = null;
        }
        return;
      }
      isSuspended = nextSuspended;
      resumeStartedAtMs = null;
      pendingResume = !isSuspended;
      suspendStartedAtMs = isSuspended && fade ? performance.now() : null;
      for (const suspendRecord of recordList) {
        if (isSuspended && fade) {
          suspendRecord.fadeOutStrength = suspendRecord.overlay.visible
            ? suspendRecord.overlay.material.uniforms.strength.value
            : 0;
          suspendRecord.fadeOutMatrix = suspendRecord.matrix.clone();
          suspendRecord.source.updateWorldMatrix(true, false);
          suspendRecord.fadeOutFrame = suspendRecord.source.matrixWorld.clone();
        }
        suspendRecord.overlay.visible = false;
        suspendRecord.overlay.removeFromParent();
      }
      needsUpdate = true;
      if (!isSuspended) {
        rootFirstChild = null;
      }
      requestFrame();
    },
    get records() {
      return recordList;
    },
    invalidate() {
      needsUpdate = true;
    },
    changed(changedFloorIds) {
      if (changedFloorIds == null) {
        changeRevisionCount++;
      } else {
        for (const changedFloorId of new Set(changedFloorIds)) {
          if (!changedFloorId || !heightByFloorId.has(String(changedFloorId))) {
            changeRevisionCount++;
            continue;
          }
          floorChangeCounts.set(
            String(changedFloorId),
            (floorChangeCounts.get(String(changedFloorId)) || 0) + 1
          );
        }
      }
    },
    dispose() {
      isDisposed = true;
      detail?.dispose();
      clearTimeout(throttleTimer);
      disposeAllRecords();
      blurMesh.geometry.dispose();
      blurMaterial.dispose();
      for (const disposeListener of [...disposeHandlerByClone.values()]) {
        disposeListener();
      }
      floorChangeCounts.clear();
      heightByFloorId.clear();
      lightsByFloorId.clear();
    }
  };
}
