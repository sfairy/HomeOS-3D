export function cameraOnline(entityStateOrEvent) {
  const entityState = entityStateOrEvent?.newState || entityStateOrEvent,
    normalizedState = String(entityState?.state || "")
      .trim()
      .toLowerCase();
  return (
    entityState?.available !== false &&
    !!normalizedState &&
    !["unknown", "unavailable", "none"].includes(normalizedState)
  );
}
export function createCameraStatus({ THREE: three, requestFrame: onRequestFrame = () => {} }) {
  const statusByBindingId = new Map(),
    meshGeometry = new three.SphereGeometry(1, 10, 8),
    makeFloorModelKey = (floorId, modelId) => JSON.stringify([floorId, modelId]);
  let previousRoot,
    previousRevision,
    previousSignature,
    isDisposed = false;
  const disposeStatusEntry = (statusEntry) => {
    (statusEntry.mesh.removeFromParent(), statusEntry.mesh.material.dispose());
  };
  function syncCameraStatus({
    root: modelRoot,
    revision: sceneRevision,
    bindings: cameraBindings = [],
    states: statesByEntityId = {},
    enabled: isEnabled = false,
    brightness: brightnessLevel = 1,
  }) {
    if (isDisposed) return;
    let hasChanged = false;
    const bindingsSignature = JSON.stringify(
      cameraBindings.map((binding) => [
        binding.id,
        binding.floorId,
        binding.modelId,
        binding.width,
        binding.height,
        binding.depth,
      ]),
    );
    if (
      previousRoot !== modelRoot ||
      previousRevision !== sceneRevision ||
      previousSignature !== bindingsSignature
    ) {
      ((previousRoot = modelRoot),
        (previousRevision = sceneRevision),
        (previousSignature = bindingsSignature));
      const modelsByFloorModelKey = new Map();
      previousRoot?.traverse((sceneObject) => {
        if (sceneObject.userData?.environmentModelType !== "camera") return;
        let resolvedFloorId = sceneObject.userData.environmentFloorId;
        for (
          let ancestorObject = sceneObject.parent;
          resolvedFloorId == null && ancestorObject;
          ancestorObject = ancestorObject.parent
        )
          resolvedFloorId = ancestorObject.userData.environmentFloorId;
        modelsByFloorModelKey.set(
          makeFloorModelKey(resolvedFloorId, sceneObject.userData.environmentModelId),
          sceneObject,
        );
      });
      const matchedBindingIdSet = new Set();
      for (const activeBinding of cameraBindings) {
        const modelObject = modelsByFloorModelKey.get(
          makeFloorModelKey(activeBinding.floorId, activeBinding.modelId),
        );
        if (!modelObject) continue;
        matchedBindingIdSet.add(activeBinding.id);
        let existingStatusEntry = statusByBindingId.get(activeBinding.id);
        if (existingStatusEntry?.model !== modelObject) {
          existingStatusEntry && disposeStatusEntry(existingStatusEntry);
          const statusMaterial = new three.MeshBasicMaterial({
              color: 7830916,
              toneMapped: false,
              transparent: true,
              depthWrite: false,
            }),
            statusMesh = new three.Mesh(meshGeometry, statusMaterial);
          ((statusMesh.name = "camera-status-" + activeBinding.id),
            Object.assign(statusMesh.userData, {
              environmentEffect: true,
              cameraStatus: true,
              externalModelSharedGeometry: true,
              externalModelSharedMaterial: true,
            }),
            (statusMesh.raycast = () => {}),
            modelObject.add(statusMesh),
            (existingStatusEntry = {
              model: modelObject,
              mesh: statusMesh,
            }),
            statusByBindingId.set(activeBinding.id, existingStatusEntry),
            (hasChanged = true));
        }
        (existingStatusEntry.mesh.position.set(
          0,
          activeBinding.height * 0.84,
          activeBinding.depth * 0.475,
        ),
          existingStatusEntry.mesh.scale.setScalar(Math.max(0.003, activeBinding.width * 0.027)));
      }
      for (const [bindingId, staleStatusEntry] of statusByBindingId)
        matchedBindingIdSet.has(bindingId) ||
          (disposeStatusEntry(staleStatusEntry),
          statusByBindingId.delete(bindingId),
          (hasChanged = true));
    }
    for (const renderBinding of cameraBindings) {
      const renderStatusEntry = statusByBindingId.get(renderBinding.id);
      if (!renderStatusEntry) continue;
      const isVisible = isEnabled && !!renderBinding.entityId,
        statusColorHex = cameraOnline(statesByEntityId[renderBinding.entityId]) ? 8571275 : 7830916;
      ((hasChanged =
        hasChanged ||
        renderStatusEntry.mesh.visible !== isVisible ||
        renderStatusEntry.mesh.material.color.getHex() !== statusColorHex ||
        renderStatusEntry.mesh.material.opacity !== brightnessLevel),
        (renderStatusEntry.mesh.visible = isVisible),
        renderStatusEntry.mesh.material.color.setHex(statusColorHex),
        (renderStatusEntry.mesh.material.opacity = brightnessLevel));
    }
    hasChanged && onRequestFrame();
  }
  return {
    sync: syncCameraStatus,
    dispose() {
      if (!isDisposed) {
        isDisposed = true;
        for (const disposedStatusEntry of statusByBindingId.values())
          disposeStatusEntry(disposedStatusEntry);
        (statusByBindingId.clear(), meshGeometry.dispose());
      }
    },
  };
}
