function nasState(entityId: any, state: any) {
  const stateObject = state?.newState || state || {},
    stateValue = String(stateObject.state || "")
      .trim()
      .toLowerCase(),
    available =
      /^(binary_sensor|switch|input_boolean)\.[a-z0-9_]+$/.test(entityId || "") &&
      stateObject.available !== false &&
      ["on", "off"].includes(stateValue);
  return {
    available: available,
    on: available && stateValue === "on",
    name: stateObject.attributes?.friendly_name || entityId || "NAS",
  };
}
/** NAS / 存储设备的展示状态。 */
type NasDeviceState = {
  available?: boolean;
  on?: boolean;
  name?: any;
  /** 指示灯颜色。 */
  color?: string;
  /** 是否可见（NAS 机型恒为 true）。 */
  visible?: boolean;
  /** 运行状态：normal / warning / off…。 */
  status?: string;
  [stateKey: string]: any;
};

export function nasDeviceState(nasItem: any, stateSources: Record<string, any> = {}): NasDeviceState {
  const readStateEntry = (stateEntityId: any) =>
    stateSources instanceof Map ? stateSources.get(stateEntityId) : (stateSources as any)[stateEntityId];
  if (nasItem.entityId) return nasState(nasItem.entityId, readStateEntry(nasItem.entityId));
  const hasActiveMetric = [
    ...new Set([
      nasItem.statusSource?.primaryEntityId,
      ...(nasItem.statusSource?.metrics || []).map((metricSource: any) => metricSource.entityId),
    ]),
  ].some((metricEntityId) => {
    const metricState = readStateEntry(metricEntityId)?.newState || readStateEntry(metricEntityId);
    return (
      !!metricEntityId &&
      metricState?.available !== false &&
      metricState?.state != null &&
      !["", "unknown", "unavailable", "none"].includes(
        String(metricState.state).trim().toLowerCase(),
      )
    );
  });
  return {
    available: hasActiveMetric,
    on: hasActiveMetric,
    name: nasItem.statusSource?.name || "NAS",
  };
}
export function createNasStatus({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  modelType: modelType = "nas",
  readState: readState = nasDeviceState,
}: any) {
  const meshesByBindingId = new Map(),
    planeGeometry = new THREE.PlaneGeometry(1, 1);
  let syncedRoot: any,
    syncedRevision: any,
    syncedBindingsSignature: any,
    isDisposed = false,
    hasVisibleIndicator = false,
    lastTickMs = -Infinity;
  const prefersReducedMotionNow = () => reducedMotionQuery?.matches === true,
    isNodeVisible = (sceneNode: any) => {
      for (
        let visibleAncestor = sceneNode;
        visibleAncestor;
        visibleAncestor = visibleAncestor.parent
      ) {
        if (visibleAncestor.visible === false) return false;
        if (visibleAncestor === syncedRoot) return true;
      }
      return false;
    },
    hasVisibleBreathingIndicator = () => {
      if (hasVisibleIndicator) {
        for (const visibleEntry of meshesByBindingId.values())
          if (visibleEntry.breathing && isNodeVisible(visibleEntry.mesh)) return true;
      }
      return false;
    },
    reducedMotionQuery =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ??
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    requestFrameIfBreathing = () => {
      !isDisposed && hasVisibleBreathingIndicator() && requestFrame();
    };
  reducedMotionQuery?.addEventListener?.("change", requestFrameIfBreathing);
  const sceneModelKey = (floorId: any, modelId: any) => JSON.stringify([floorId || "", modelId || ""]);
  function releaseEntry(entry: any) {
    for (const [indicator, wasVisible] of entry.indicators) indicator.visible = wasVisible;
    (entry.mesh.removeFromParent(), entry.mesh.material.dispose());
  }
  function modelWorldBounds(modelRoot: any) {
    const accumulatedBounds = new THREE.Box3();
    function accumulateBounds(node: any, parentMatrix: any) {
      if (
        !node.userData?.environmentEffect &&
        !(node !== modelRoot && node.userData?.environmentModelId != null)
      ) {
        node.isMesh &&
          node.geometry &&
          (node.geometry.boundingBox || node.geometry.computeBoundingBox(),
          node.geometry.boundingBox &&
            accumulatedBounds.union(node.geometry.boundingBox.clone().applyMatrix4(parentMatrix)));
        for (const childNode of node.children || [])
          (childNode.matrixAutoUpdate && childNode.updateMatrix(),
            accumulateBounds(
              childNode,
              new THREE.Matrix4().multiplyMatrices(parentMatrix, childNode.matrix),
            ));
      }
    }
    return (accumulateBounds(modelRoot, new THREE.Matrix4()), accumulatedBounds);
  }
  function findNasStatusAnchor(anchorModelRoot: any) {
    let resolvedAnchorPosition: any = null;
    function visitAnchorNode(anchorNode: any, anchorParentMatrix: any) {
      if (
        resolvedAnchorPosition ||
        anchorNode.userData?.environmentEffect ||
        (anchorNode !== anchorModelRoot && anchorNode.userData?.environmentModelId != null)
      )
        return;
      const anchorCoordinates = anchorNode.userData?.nasStatusAnchor;
      if (
        Array.isArray(anchorCoordinates) &&
        anchorCoordinates.length === 3 &&
        anchorCoordinates.every(Number.isFinite)
      ) {
        resolvedAnchorPosition = new THREE.Vector3()
          .fromArray(anchorCoordinates)
          .applyMatrix4(anchorParentMatrix);
        return;
      }
      for (const anchorChildNode of anchorNode.children || [])
        (anchorChildNode.matrixAutoUpdate && anchorChildNode.updateMatrix(),
          visitAnchorNode(
            anchorChildNode,
            new THREE.Matrix4().multiplyMatrices(anchorParentMatrix, anchorChildNode.matrix),
          ));
    }
    return (visitAnchorNode(anchorModelRoot, new THREE.Matrix4()), resolvedAnchorPosition);
  }
  function sync({
    root: root,
    revision: revision,
    bindings: bindings = [],
    states: states = {},
    enabled: enabled = false,
    sizeScale: sizeScale = 1,
    brightness: brightness = 1,
  }: any) {
    if (isDisposed) return;
    const bindingsSignature = JSON.stringify(
      bindings.map((bindingConfig: any) => [
        bindingConfig.id,
        bindingConfig.floorId,
        bindingConfig.modelId,
      ]),
    );
    if (
      syncedRoot !== root ||
      syncedRevision !== revision ||
      syncedBindingsSignature !== bindingsSignature
    ) {
      ((syncedRoot = root),
        (syncedRevision = revision),
        (syncedBindingsSignature = bindingsSignature));
      const modelsByLocation = new Map();
      syncedRoot?.traverse((sceneObject: any) => {
        if (sceneObject.userData?.environmentModelType !== modelType) return;
        let ancestorFloorId = sceneObject.userData.environmentFloorId;
        for (
          let ancestor = sceneObject.parent;
          ancestorFloorId == null && ancestor;
          ancestor = ancestor.parent
        )
          ancestorFloorId = ancestor.userData.environmentFloorId;
        modelsByLocation.set(
          sceneModelKey(ancestorFloorId, sceneObject.userData.environmentModelId),
          sceneObject,
        );
      });
      const activeBindingIdSet = new Set();
      for (const binding of bindings) {
        const matchedModel = modelsByLocation.get(sceneModelKey(binding.floorId, binding.modelId));
        if (!matchedModel) continue;
        activeBindingIdSet.add(binding.id);
        let existing = meshesByBindingId.get(binding.id);
        if (existing?.model !== matchedModel) {
          existing && releaseEntry(existing);
          const modelBounds = modelWorldBounds(matchedModel);
          if (modelBounds.isEmpty()) {
            meshesByBindingId.delete(binding.id);
            continue;
          }
          const modelSize = modelBounds.getSize(new THREE.Vector3()),
            modelCenter = modelBounds.getCenter(new THREE.Vector3()),
            ledMaterial = new THREE.ShaderMaterial({
              transparent: true,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
              uniforms: {
                indicatorColor: {
                  value: new THREE.Color("#0fff33"),
                },
                customColor: {
                  value: modelType !== "nas" ? 1 : 0,
                },
                pulse: {
                  value: 1,
                },
                viewportHeight: {
                  value: 900,
                },
                sizeScale: {
                  value: 1,
                },
                brightness: {
                  value: 1,
                },
              },
              vertexShader:
                "varying vec2 ledUv; uniform float viewportHeight; uniform float sizeScale; void main(){ledUv=uv;vec4 center=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);vec4 clip=projectionMatrix*center;float physicalSize=length(modelMatrix[0].xyz);float minimumSize=24.0*clip.w/(max(viewportHeight,1.0)*projectionMatrix[1][1]);center.xy+=position.xy*max(physicalSize,minimumSize)*sizeScale;gl_Position=projectionMatrix*center;}",
              fragmentShader:
                "varying vec2 ledUv; uniform float pulse; uniform float brightness; uniform vec3 indicatorColor; uniform float customColor; void main(){float r=length(ledUv-0.5)*2.0;float core=1.0-smoothstep(0.28,0.50,r);float halo=pow(max(0.0,1.0-r),1.7)*0.8;float a=min((core+halo)*pulse,1.0)*brightness;if(a<0.005)discard;gl_FragColor=vec4(mix(vec3(0.06,1.0,0.20),vec3(0.48,1.0,0.60),core)*(1.0-customColor)+indicatorColor*customColor,a);}",
            }),
            ledMesh = new THREE.Mesh(planeGeometry, ledMaterial);
          ((ledMesh.name = "nas-status-" + binding.id),
            Object.assign(ledMesh.userData, {
              environmentEffect: true,
              nasStatus: true,
              externalModelSharedGeometry: true,
              externalModelSharedMaterial: true,
            }),
            (ledMesh.raycast = () => {}),
            (ledMesh.renderOrder = 100));
          const viewportSize = new THREE.Vector2();
          ledMesh.onBeforeRender = (renderer: any) => {
            ledMaterial.uniforms.viewportHeight.value = renderer.getSize(viewportSize).y;
          };
          const indicatorSize = Math.max(0.025, Math.min(0.075, modelSize.x * 0.22));
          (ledMesh.scale.set(indicatorSize, indicatorSize, indicatorSize),
            ledMesh.position.set(
              modelCenter.x + modelSize.x * 0.36,
              modelBounds.min.y + modelSize.y * 0.26,
              modelBounds.max.z + 0.003,
            ),
            (modelType === "storagewaterheater" || modelType === "gaswaterheater") &&
              ledMesh.position.set(
                modelCenter.x,
                modelBounds.min.y + modelSize.y * (modelType === "gaswaterheater" ? 0.67 : 0.53),
                modelBounds.max.z + 0.003,
              ));
          const anchorPosition = modelType === "nas" ? findNasStatusAnchor(matchedModel) : null;
          anchorPosition && ledMesh.position.copy(anchorPosition);
          const suppressedVisibilityByNode = new Map();
          (matchedModel.traverse((child: any) => {
            if (!child.isMesh || child === ledMesh || child.userData?.environmentEffect) return;
            const childMaterials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            (child.userData?.nasIndicator ||
              childMaterials.some((childMaterial: any) =>
                /^nas-material-4(?:$|\s)/.test(childMaterial?.name || ""),
              )) &&
              (suppressedVisibilityByNode.set(child, child.visible), (child.visible = false));
          }),
            matchedModel.add(ledMesh),
            (existing = {
              model: matchedModel,
              mesh: ledMesh,
              indicators: suppressedVisibilityByNode,
            }),
            meshesByBindingId.set(binding.id, existing));
        }
      }
      for (const [bindingId, staleEntry] of meshesByBindingId)
        activeBindingIdSet.has(bindingId) ||
          (releaseEntry(staleEntry), meshesByBindingId.delete(bindingId));
    }
    hasVisibleIndicator = false;
    let shouldRender = false;
    for (const activeBinding of bindings) {
      const bindingEntry = meshesByBindingId.get(activeBinding.id);
      if (!bindingEntry) continue;
      const uniforms = bindingEntry.mesh.material.uniforms;
      ((shouldRender ||=
        uniforms.sizeScale.value !== sizeScale || uniforms.brightness.value !== brightness),
        (uniforms.sizeScale.value = sizeScale),
        (uniforms.brightness.value = brightness));
      const deviceState = readState(activeBinding, states);
      deviceState.color &&
        ((shouldRender ||= bindingEntry.color !== deviceState.color),
        (bindingEntry.color = deviceState.color),
        uniforms.indicatorColor.value.set(deviceState.color));
      const customColor = modelType !== "nas" && deviceState.color !== "#43ce82" ? 1 : 0;
      ((shouldRender ||= uniforms.customColor.value !== customColor),
        (uniforms.customColor.value = customColor));
      const shouldShow =
        enabled &&
        (modelType === "nas"
          ? deviceState.on
          : deviceState.visible && deviceState.status !== "off");
      ((shouldRender ||= bindingEntry.mesh.visible !== shouldShow),
        (bindingEntry.mesh.visible = shouldShow),
        (bindingEntry.breathing =
          shouldShow &&
          (modelType === "nas" ||
            deviceState.status === "normal" ||
            deviceState.status === "warning")),
        bindingEntry.breathing
          ? (hasVisibleIndicator = true)
          : ((shouldRender ||= uniforms.pulse.value !== 1), (uniforms.pulse.value = 1)));
    }
    (shouldRender || hasVisibleIndicator) && requestFrame();
  }
  function tick(nowMs: any) {
    if (isDisposed || !hasVisibleBreathingIndicator()) return ((lastTickMs = -Infinity), false);
    const reducedMotion = prefersReducedMotionNow();
    if (!reducedMotion && nowMs - lastTickMs < 1000 / 30) return true;
    lastTickMs = nowMs;
    const pulse = reducedMotion
      ? 1
      : 0.14 + 0.86 * (0.5 - 0.5 * Math.cos((nowMs / 1400) * Math.PI * 2));
    let hasChanged = false;
    for (const meshEntry of meshesByBindingId.values())
      meshEntry.breathing &&
        isNodeVisible(meshEntry.mesh) &&
        ((hasChanged ||= meshEntry.mesh.material.uniforms.pulse.value !== pulse),
        (meshEntry.mesh.material.uniforms.pulse.value = pulse));
    return (hasChanged && requestFrame(), !reducedMotion);
  }
  return {
    sync: sync,
    tick: tick,
    nextDelay: () =>
      !isDisposed && hasVisibleBreathingIndicator() && !prefersReducedMotionNow()
        ? 1000 / 30
        : Infinity,
    dispose() {
      if (!isDisposed) {
        ((isDisposed = true),
          reducedMotionQuery?.removeEventListener?.("change", requestFrameIfBreathing));
        for (const disposedEntry of meshesByBindingId.values()) releaseEntry(disposedEntry);
        (meshesByBindingId.clear(), planeGeometry.dispose());
      }
    },
  };
}
