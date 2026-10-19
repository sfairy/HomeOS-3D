/**
 * 加湿器 / 香氛机的喷雾效果（0.7.8 `device-mist`）。
 *
 * 只有 `animationEntityId` 是开关类实体、并且已作为附加控件暴露时，
 * 喷雾才会跟随实体开关；否则保持静止并给出提示文案。
 */

/** 可作为喷雾开关的实体 id（域 + object_id）。 */
export const isDeviceMistSource = (entityId: any) =>
  /^(switch|input_boolean|fan)\.[a-z0-9_]+$/.test(String(entityId || ""));

export type DeviceMistState = {
  entityId: string;
  available: boolean;
  running: boolean;
  label: string;
};

export function deviceMistState(device: any = {}, states: any = {}): DeviceMistState {
  const entityId = device.animationEntityId || "",
    hasMistControl =
      !!device.deviceId &&
      isDeviceMistSource(entityId) &&
      !!device.extraControls?.some?.((control: any) => control.entityId === entityId),
    rawState = states instanceof Map ? states.get(entityId) : states?.[entityId],
    entityState = rawState?.newState || rawState,
    available =
      hasMistControl &&
      rawState?.available !== false &&
      entityState?.available !== false &&
      ["on", "off"].includes(entityState?.state),
    running = available && entityState.state === "on";
  return {
    entityId,
    available,
    running,
    label: entityId
      ? available
        ? running
          ? "喷雾中"
          : "已停止"
        : "状态不可用，已停止"
      : "未绑定开关",
  };
}

/** 单条喷雾飘带：7 层、每层 41 个采样点，双面三角带。 */
export function createMistPlume(THREE: any) {
  const positionValues: number[] = [],
    uvValues: number[] = [],
    sideValues: number[] = [],
    phaseValues: number[] = [],
    indexValues: number[] = [],
    layerOffsets = [0, -1, 1, -2, 2, -3, 3];
  for (let layerIndex = 0; layerIndex < 7; layerIndex++) {
    const layerStartVertex = positionValues.length / 3;
    for (let sampleIndex = 0; sampleIndex <= 40; sampleIndex++) {
      const t = sampleIndex / 40;
      for (const sideSign of [-1, 1]) {
        (positionValues.push(layerOffsets[layerIndex] * 0.003 * t, t, 0),
          uvValues.push((sideSign + 1) / 2, t),
          sideValues.push(sideSign),
          phaseValues.push(layerIndex * 0.47));
      }
      if (sampleIndex < 40) {
        const baseIndex = layerStartVertex + sampleIndex * 2;
        indexValues.push(
          baseIndex,
          baseIndex + 1,
          baseIndex + 2,
          baseIndex + 1,
          baseIndex + 3,
          baseIndex + 2,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  (geometry.setAttribute("position", new THREE.Float32BufferAttribute(positionValues, 3)),
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvValues, 2)),
    geometry.setAttribute("mistSide", new THREE.Float32BufferAttribute(sideValues, 1)),
    geometry.setAttribute("mistPhase", new THREE.Float32BufferAttribute(phaseValues, 1)),
    geometry.setIndex(indexValues));

  const uniforms = {
    mistTime: { value: 0 },
    mistHeight: { value: 0.42 },
    mistOpacity: { value: 1 },
    mistContrast: { value: 0.35 },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms,
    vertexShader: `attribute float mistSide;attribute float mistPhase;uniform float mistTime;uniform float mistHeight;varying vec2 mistUv;varying float phase;
      void main(){mistUv=uv;phase=mistPhase;float t=uv.y;vec3 p=position;
        p.y=t*mistHeight;p.x+=sin(t*5.0-mistTime*0.65+mistPhase)*0.012*t;
        p.z=cos(t*4.0-mistTime*0.5+mistPhase)*0.006*t;
        vec4 view=modelViewMatrix*vec4(p,1.0);
        view.x+=mistSide*mix(0.012,0.075,t)*length(modelMatrix[0].xyz);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `uniform float mistTime;uniform float mistOpacity;uniform float mistContrast;varying vec2 mistUv;varying float phase;
      void main(){float across=abs(mistUv.x*2.0-1.0);
        float feather=exp(-across*across*3.2)*(1.0-smoothstep(0.7,1.0,across));
        float ends=smoothstep(0.0,0.08,mistUv.y)*(1.0-smoothstep(0.48,1.0,mistUv.y));
        float flow=0.72+0.28*sin(mistUv.y*11.0-mistTime*1.7+phase);
        float alpha=feather*ends*flow*0.19*mistOpacity;
        // White vapour needs soft self-shading against pale walls. Keep the
        // core light, with moving grey folds rather than an enclosing panel.
        float fold=0.5+0.5*sin(mistUv.y*8.0-mistTime*0.8+phase);
        float core=1.0-smoothstep(0.15,0.65,across);
        float shade=mistContrast*(1.0-core)*(0.38+0.08*fold);
        if(alpha<0.003)discard;gl_FragColor=vec4(vec3(1.0-shade),alpha);}`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  ((mesh.name = "device-mist"),
    (mesh.visible = false),
    (mesh.frustumCulled = false),
    Object.assign(mesh.userData, {
      environmentEffect: true,
      deviceMist: true,
      disableContactShadow: true,
    }),
    (mesh.raycast = () => {}));

  let isRunning = false,
    isDisposed = false;
  return {
    mesh,
    configure(
      requestedRunning: boolean,
      mistHeight = 0.42,
      visibleLayers = 7,
      mistOpacity = 1,
      mistContrast = 0.35,
    ) {
      if (isDisposed) return;
      (isRunning !== requestedRunning && (uniforms.mistTime.value = 0), (isRunning = requestedRunning));
      ((mesh.visible = requestedRunning),
        (uniforms.mistHeight.value = mistHeight),
        (uniforms.mistOpacity.value = mistOpacity),
        (uniforms.mistContrast.value = mistContrast),
        geometry.setDrawRange(0, visibleLayers * 40 * 6));
    },
    tick(elapsedSeconds: number) {
      if (isDisposed || !isRunning) return true;
      uniforms.mistTime.value += Math.min(0.15, Math.max(0, elapsedSeconds));
      return true;
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        (isRunning = false),
        (mesh.visible = false),
        mesh.removeFromParent(),
        geometry.dispose(),
        material.dispose());
    },
  };
}

const sceneModelKey = (binding: any) =>
    JSON.stringify([binding.floorId, binding.modelId]),
  isVisibleInSceneHierarchy = (sceneNode: any) => {
    for (let ancestor = sceneNode; ancestor; ancestor = ancestor.parent)
      if (ancestor.visible === false) return false;
    return true;
  };

export type DeviceMistController = {
  sync: (payload: {
    root: any;
    revision: any;
    bindings?: any[];
    states?: any;
    enabled?: boolean;
    sceneStyle?: string;
  }) => void;
  tick: (nowMs: number) => boolean;
  nextDelay: () => number;
  setAvailable: (isAvailable: boolean) => void;
  dispose: () => void;
};

export function createDeviceMist({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  requestAnimation: requestAnimation = requestFrame,
  reducedMotion: reducedMotion,
  getCamera: getCamera,
  getViewportHeight: getViewportHeight = () => 900,
}: {
  THREE?: any;
  requestFrame?: () => void;
  requestAnimation?: () => void;
  reducedMotion?: boolean;
  getCamera?: (model: any) => any;
  getViewportHeight?: () => number;
} = {}): DeviceMistController {
  const plumeByKey = new Map<string, any>();
  let rootObject: any,
    rootRevision: any,
    modelsByKey = new Map<string, any>(),
    isAvailable = true,
    isDisposed = false,
    mistContrast = 0.35;

  const reducedMotionQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),
    prefersReducedMotion = () =>
      reducedMotion ?? reducedMotionQuery?.matches === true;

  /** 用模型上的 `deviceMistOutlet` 锚点定位飘带；没有锚点返回 false。 */
  function placePlumeAtOutlet(entryRecord: any) {
    const model = entryRecord.model;
    model.updateWorldMatrix(true, true);
    const inverseModelMatrix = model.matrixWorld.clone().invert();
    let didFindOutlet = false;
    model.traverse((sceneNode: any) => {
      if (didFindOutlet || !Array.isArray(sceneNode.userData?.deviceMistOutlet)) return;
      const outletPosition = new THREE.Vector3().fromArray(sceneNode.userData.deviceMistOutlet),
        outletMatrix = new THREE.Matrix4().multiplyMatrices(inverseModelMatrix, sceneNode.matrixWorld);
      (entryRecord.effect.mesh.position.copy(outletPosition.applyMatrix4(outletMatrix)),
        entryRecord.effect.mesh.scale.setFromMatrixScale(outletMatrix),
        (didFindOutlet = true));
    });
    return didFindOutlet;
  }

  const headPosition = new THREE.Vector3(),
    topPosition = new THREE.Vector3();

  /** 依据屏幕上的可见高度决定层数与节流，远景直接不画。 */
  function updateDetail(entryRecord: any, visibleLayers: number, opacity: number, delay: number) {
    ((entryRecord.detail.layers = visibleLayers),
      (entryRecord.detail.opacity = opacity),
      (entryRecord.detail.delay = delay));
    return entryRecord.detail;
  }
  function resolveDetail(entryRecord: any) {
    if (!isVisibleInSceneHierarchy(entryRecord.model))
      return updateDetail(entryRecord, 0, 0, Infinity);
    const camera = getCamera?.(entryRecord.model);
    if (!camera) return updateDetail(entryRecord, 7, 1, 1000 / 30);
    const mistMesh = entryRecord.effect.mesh;
    (mistMesh.updateWorldMatrix(true, false), camera.updateMatrixWorld(true));
    (headPosition
      .set(0, 0, 0)
      .applyMatrix4(mistMesh.matrixWorld)
      .project(camera),
      topPosition
        .set(0, entryRecord.height, 0)
        .applyMatrix4(mistMesh.matrixWorld)
        .project(camera));
    const onScreenHeight = (Math.abs(topPosition.y - headPosition.y) * getViewportHeight()) / 2;
    return !Number.isFinite(onScreenHeight) ||
      onScreenHeight < 6 ||
      headPosition.z > 1 ||
      headPosition.z < -1 ||
      Math.abs(headPosition.x) > 1.2 ||
      Math.abs(headPosition.y) > 1.3
      ? updateDetail(entryRecord, 0, 0, Infinity)
      : onScreenHeight < 48
        ? updateDetail(entryRecord, 3, 0.55, 1000 / 12)
        : updateDetail(entryRecord, 7, 1, 1000 / 30);
  }
  function applyEntry(entryRecord: any) {
    if (!isAvailable || prefersReducedMotion() || !entryRecord.running) {
      (entryRecord.effect.configure(false, entryRecord.height), (entryRecord.lastTime = null));
      return;
    }
    (resolveDetail(entryRecord),
      entryRecord.effect.configure(
        entryRecord.detail.layers > 0,
        entryRecord.height,
        entryRecord.detail.layers,
        entryRecord.detail.opacity,
        mistContrast,
      ),
      entryRecord.detail.layers || (entryRecord.lastTime = null));
  }
  function refreshAll() {
    for (const entryRecord of plumeByKey.values()) applyEntry(entryRecord);
    requestFrame();
  }
  reducedMotionQuery?.addEventListener?.("change", refreshAll);

  return {
    sync({ root, revision, bindings = [], states = {}, enabled = true, sceneStyle = "default" }) {
      if (isDisposed) return;
      mistContrast = sceneStyle === "warm-wood" ? 1 : 0.35;
      const didSceneChange = rootObject !== root || rootRevision !== revision;
      didSceneChange &&
        ((rootObject = root),
        (rootRevision = revision),
        (modelsByKey = new Map()),
        rootObject?.traverse((sceneNode: any) => {
          ["humidifier", "aroma-diffuser"].includes(sceneNode.userData?.environmentModelType) &&
            modelsByKey.set(
              sceneModelKey({
                floorId: sceneNode.userData.environmentFloorId,
                modelId: sceneNode.userData.environmentModelId,
              }),
              sceneNode,
            );
        }));

      const liveKeySet = new Set<string>();
      let shouldRequestFrame = false;
      for (const binding of bindings) {
        if (binding.visible === false) continue;
        const bindingKey = sceneModelKey(binding),
          model = modelsByKey.get(bindingKey);
        if (!model) continue;
        let entryRecord = plumeByKey.get(bindingKey);
        if (entryRecord && entryRecord.model !== model) {
          (entryRecord.effect.dispose(), plumeByKey.delete(bindingKey), (entryRecord = null));
        }
        if (entryRecord) {
          didSceneChange && placePlumeAtOutlet(entryRecord);
        } else {
          entryRecord = {
            model,
            effect: createMistPlume(THREE),
            height: model.userData.environmentModelType === "humidifier" ? 0.42 : 0.32,
            running: false,
            lastTime: null,
            detail: { layers: 7, opacity: 1, delay: 1000 / 30 },
          };
          if (!placePlumeAtOutlet(entryRecord)) {
            entryRecord.effect.dispose();
            continue;
          }
          (model.add(entryRecord.effect.mesh),
            plumeByKey.set(bindingKey, entryRecord),
            (shouldRequestFrame = true));
        }
        liveKeySet.add(bindingKey);
        const shouldRun = enabled && deviceMistState(binding, states).running;
        shouldRun !== entryRecord.running &&
          ((entryRecord.running = shouldRun),
          (entryRecord.lastTime = null),
          (shouldRequestFrame = true));
        applyEntry(entryRecord);
      }
      for (const [staleKey, staleRecord] of plumeByKey)
        liveKeySet.has(staleKey) ||
          (staleRecord.effect.dispose(), plumeByKey.delete(staleKey), (shouldRequestFrame = true));
      shouldRequestFrame && requestFrame();
    },
    tick(nowMs: number) {
      if (isDisposed || !isAvailable) return false;
      let didAnimate = false;
      for (const entryRecord of plumeByKey.values()) {
        applyEntry(entryRecord);
        const frameDelay = entryRecord.detail.delay;
        if (
          !entryRecord.running ||
          !Number.isFinite(frameDelay) ||
          !entryRecord.effect.mesh.visible ||
          (entryRecord.lastTime !== null && nowMs - entryRecord.lastTime < frameDelay - 0.5)
        )
          continue;
        const elapsedSeconds =
          entryRecord.lastTime === null
            ? frameDelay / 1000
            : Math.min(0.15, Math.max(0, (nowMs - entryRecord.lastTime) / 1000));
        entryRecord.lastTime = nowMs;
        didAnimate = entryRecord.effect.tick(elapsedSeconds) || didAnimate;
      }
      return (didAnimate && requestAnimation(), didAnimate);
    },
    nextDelay() {
      if (isDisposed || !isAvailable || prefersReducedMotion()) return Infinity;
      let nextDelayMs = Infinity;
      for (const entryRecord of plumeByKey.values())
        entryRecord.running &&
          isVisibleInSceneHierarchy(entryRecord.model) &&
          (nextDelayMs = Math.min(nextDelayMs, entryRecord.detail.delay));
      return nextDelayMs;
    },
    setAvailable(isNowAvailable: boolean) {
      isDisposed || ((isAvailable = !!isNowAvailable), refreshAll());
    },
    dispose() {
      if (isDisposed) return;
      ((isDisposed = true), reducedMotionQuery?.removeEventListener?.("change", refreshAll));
      for (const entryRecord of plumeByKey.values()) entryRecord.effect.dispose();
      (plumeByKey.clear(), modelsByKey.clear(), (rootObject = null));
    },
  };
}
